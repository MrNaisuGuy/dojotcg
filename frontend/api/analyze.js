import { readFile } from "node:fs/promises";
import formidable from "formidable";
import OpenAI from "openai";

const FALLBACK_CARD_IMAGE = "/images/dojobird.png";
const REGIONAL_PRICE_MULTIPLIERS = {
  pokemon: {
    jp: 0.9,
    kr: 0.45,
  },
  onepiece: {
    jp: 1.1,
    kr: 0.35,
  },
  mtg: {
    jp: 0.85,
    kr: 0.65,
  },
};
const CHARACTER_PRICE_MODIFIERS = [
  { pattern: /charizard/i, multiplier: 1.2 },
  { pattern: /pikachu/i, multiplier: 1.15 },
  { pattern: /eevee|vaporeon|jolteon|flareon|espeon|umbreon|leafeon|glaceon|sylveon/i, multiplier: 1.25 },
  { pattern: /lillie|marnie|iono|rosa|erika|misty|cynthia|jessie|serena|lusamine/i, multiplier: 1.4 },
];

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Vercel production should receive env vars from Project Settings.
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  const form = formidable({
    multiples: false,
    maxFileSize: 10 * 1024 * 1024,
    filter: ({ mimetype }) => mimetype?.startsWith("image/"),
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getUploadedFile(files) {
  const uploadedFile = files.cardImage;
  return Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
}

function parseJsonResponse(text) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  return JSON.parse(jsonText);
}

function buildJustTcgQuery(cardData) {
  return [cardData.card, cardData.number].filter(Boolean).join(" ");
}

function normalizeValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeNumber(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^0+/, "")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getCollectorNumberCandidates(value) {
  const raw = String(value || "").trim();
  const beforeSlash = raw.split("/")[0]?.trim();
  const withoutLeadingZeroes = beforeSlash?.replace(/^0+/, "") || beforeSlash;

  return uniqueValues([raw, beforeSlash, withoutLeadingZeroes]);
}

function parseCollectorNumber(value) {
  const [number, printedTotal] = String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    number,
    normalizedNumber: normalizeNumber(number),
    printedTotal: printedTotal ? Number(printedTotal) : null,
  };
}

function getGameKey(game) {
  const normalized = normalizeValue(game);

  if (normalized.includes("pokemon")) return "pokemon";
  if (normalized.includes("magic") || normalized === "mtg") return "mtg";
  if (normalized.includes("one piece")) return "onepiece";

  return "unknown";
}

function roundPrice(price) {
  return typeof price === "number" ? Math.round(price * 100) / 100 : null;
}

function getCharacterModifier(cardName) {
  const modifier = CHARACTER_PRICE_MODIFIERS.find(({ pattern }) => pattern.test(cardName || ""));
  return modifier?.multiplier || 1;
}

function estimateRegionalPrices(candidate) {
  if (typeof candidate.lowestPrice !== "number") {
    return {
      us: null,
      jp: null,
      kr: null,
      basePrice: null,
      characterModifier: 1,
    };
  }

  const gameKey = getGameKey(candidate.game);
  const multipliers = REGIONAL_PRICE_MULTIPLIERS[gameKey];
  const characterModifier = gameKey === "pokemon" ? getCharacterModifier(candidate.name) : 1;

  if (!multipliers) {
    return {
      us: roundPrice(candidate.lowestPrice),
      jp: null,
      kr: null,
      basePrice: roundPrice(candidate.lowestPrice),
      characterModifier,
    };
  }

  return {
    us: roundPrice(candidate.lowestPrice),
    jp: roundPrice(candidate.lowestPrice * multipliers.jp * characterModifier),
    kr: roundPrice(candidate.lowestPrice * multipliers.kr * characterModifier),
    basePrice: roundPrice(candidate.lowestPrice),
    characterModifier,
  };
}

function quotePokemonQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getPokemonQueryParts(candidate, { includeSet = false, includeNumber = true } = {}) {
  const parts = [];

  if (candidate.name) {
    parts.push(`name:"${quotePokemonQueryValue(candidate.name)}"`);
  }

  if (includeNumber) {
    const { number } = parseCollectorNumber(candidate.number);

    if (number) {
      parts.push(`number:"${quotePokemonQueryValue(number)}"`);
    }
  }

  if (includeSet && candidate.set) {
    parts.push(`set.name:"${quotePokemonQueryValue(candidate.set)}"`);
  }

  return parts;
}

function getPokemonSearchQuery(candidate) {
  return getPokemonQueryParts(candidate).join(" ");
}

function getScryfallImageUrl(card) {
  const imageUris = card.image_uris || card.card_faces?.[0]?.image_uris;
  return imageUris?.normal || imageUris?.large || imageUris?.small || null;
}

function getOnePieceCardId(candidate) {
  const possibleIds = [candidate.number, candidate.set, candidate.id].filter(Boolean);

  for (const value of possibleIds) {
    const match = String(value).toUpperCase().match(/[A-Z]{1,3}\d{2}-\d{3}/);
    if (match) return match[0];
  }

  const setCode = String(candidate.set || candidate.id || "")
    .toUpperCase()
    .match(/[A-Z]{1,3}\d{2}/)?.[0];
  const number = getCollectorNumberCandidates(candidate.number)
    .map((value) => String(value).padStart(3, "0"))
    .find((value) => /^\d{3}$/.test(value));

  if (setCode && number) {
    return `${setCode}-${number}`;
  }

  return null;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function fetchPokemonImage(candidate) {
  if (!candidate.name) return null;

  const { number, normalizedNumber, printedTotal } = parseCollectorNumber(candidate.number);
  const setName = normalizeValue(candidate.set);
  const name = quotePokemonQueryValue(candidate.name);
  const queries = uniqueValues([
    getPokemonQueryParts(candidate, { includeSet: true, includeNumber: true }).join(" "),
    getPokemonQueryParts(candidate, { includeSet: false, includeNumber: true }).join(" "),
    candidate.set ? `name:"${name}" set.name:"${quotePokemonQueryValue(candidate.set)}"` : null,
    `name:"${name}"`,
  ]);
  const headers = {};

  if (process.env.POKEMONTCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  }

  for (const query of queries) {
    const searchParams = new URLSearchParams({
      q: query,
      pageSize: "10",
      select: "id,name,number,set,images",
    });
    const body = await fetchJson(
      `https://api.pokemontcg.io/v2/cards?${searchParams.toString()}`,
      { headers },
    );
    const cards = Array.isArray(body?.data) ? body.data : [];
    const rankedCards = cards
      .map((card) => {
        let score = 0;

        if (normalizeValue(card.name) === normalizeValue(candidate.name)) score += 40;
        if (normalizedNumber && normalizeNumber(card.number) === normalizedNumber) score += 35;
        if (setName && normalizeValue(card.set?.name) === setName) score += 20;
        if (setName && normalizeValue(card.set?.name).includes(setName)) score += 10;
        if (printedTotal && card.set?.printedTotal === printedTotal) score += 15;
        if (printedTotal && card.set?.total === printedTotal) score += 8;

        return { card, score };
      })
      .sort((a, b) => b.score - a.score);
    const card = rankedCards[0]?.card;
    const imageUrl = card?.images?.large || card?.images?.small || null;

    if (imageUrl) {
      return {
        imageUrl,
        imageSource: `pokemontcg.io${card?.set?.name ? ` (${card.set.name}${number ? ` #${number}` : ""})` : ""}`,
      };
    }
  }

  return null;
}

async function fetchScryfallImage(candidate) {
  if (!candidate.name) return null;

  const escapedName = candidate.name.replace(/"/g, '\\"');
  const numberQueries = getCollectorNumberCandidates(candidate.number).map(
    (number) => `!"${escapedName}" cn:${number}`,
  );
  const queries = uniqueValues([...numberQueries, `!"${escapedName}"`, `"${escapedName}"`]);
  const headers = {
    Accept: "application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "DojoTCG/0.0.1",
  };

  for (const query of queries) {
    const searchParams = new URLSearchParams({
      q: query,
      unique: "prints",
      order: "released",
    });
    const body = await fetchJson(
      `https://api.scryfall.com/cards/search?${searchParams.toString()}`,
      { headers },
    );
    const card = body?.data?.[0];
    const imageUrl = card ? getScryfallImageUrl(card) : null;

    if (imageUrl) {
      return {
        imageUrl,
        imageSource: "Scryfall",
      };
    }
  }

  const namedParams = new URLSearchParams({ fuzzy: candidate.name });
  const namedCard = await fetchJson(`https://api.scryfall.com/cards/named?${namedParams}`, {
    headers,
  });
  const namedImageUrl = namedCard ? getScryfallImageUrl(namedCard) : null;

  return namedImageUrl
    ? {
        imageUrl: namedImageUrl,
        imageSource: "Scryfall",
      }
    : null;
}

async function fetchOnePieceImage(candidate) {
  const cardId = getOnePieceCardId(candidate);
  if (!cardId) return null;

  const endpoints = [
    `https://optcgapi.com/api/sets/card/${cardId}/`,
    `https://optcgapi.com/api/decks/card/${cardId}/`,
    `https://optcgapi.com/api/promos/card/${cardId}/`,
  ];

  for (const endpoint of endpoints) {
    const responseBody = await fetchJson(endpoint);
    const card = Array.isArray(responseBody) ? responseBody[0] : responseBody;
    const imageUrl =
      card?.card_image ||
      card?.card_image_url ||
      card?.image_url ||
      card?.image ||
      card?.images?.large ||
      card?.images?.small ||
      null;

    if (imageUrl) {
      return {
        imageUrl,
        imageSource: "OPTCG API",
      };
    }
  }

  return null;
}

async function fetchCardImage(candidate) {
  const gameKey = getGameKey(candidate.game);

  try {
    if (gameKey === "pokemon") return await fetchPokemonImage(candidate);
    if (gameKey === "mtg") return await fetchScryfallImage(candidate);
    if (gameKey === "onepiece") return await fetchOnePieceImage(candidate);
  } catch (error) {
    console.error(`Image lookup failed for ${candidate.name}:`, error);
  }

  return null;
}

async function enrichCandidatesWithImages(candidates) {
  return Promise.all(
    candidates.map(async (candidate) => {
      const imageData = await fetchCardImage(candidate);

      return {
        ...candidate,
        imageUrl: imageData?.imageUrl || FALLBACK_CARD_IMAGE,
        imageSource: imageData?.imageSource || "DojoTCG fallback",
      };
    }),
  );
}

function scoreCandidate(cardData, candidate) {
  const reasons = [];
  let score = 0;

  const guessedName = normalizeValue(cardData.card);
  const candidateName = normalizeValue(candidate.name);
  const guessedGame = normalizeValue(cardData.game);
  const candidateGame = normalizeValue(candidate.game);
  const guessedSet = normalizeValue(cardData.set);
  const candidateSet = normalizeValue(candidate.set);
  const guessedNumber = normalizeNumber(cardData.number);
  const candidateNumber = normalizeNumber(candidate.number);

  // Get OpenAI confidence scores (0-100), default to 50 if not provided
  const gameConfidence = (cardData.confidenceScores?.game ?? cardData.gameConfidence ?? 50) / 100;
  const setConfidence = (cardData.confidenceScores?.set ?? cardData.setConfidence ?? 50) / 100;
  const cardConfidence = (cardData.confidenceScores?.card ?? cardData.cardConfidence ?? 50) / 100;

  // CRITICAL: Game mismatch is a hard penalty
  if (guessedGame && candidateGame && candidateGame !== guessedGame) {
    score -= 50;
    reasons.push("game mismatch");
  } else if (guessedGame && candidateGame && candidateGame === guessedGame) {
    // Boost game match using OpenAI's game confidence
    score += 20 * gameConfidence;
    reasons.push(`game match (${Math.round(gameConfidence * 100)}% confident)`);
  }

  // Set matching with confidence weighting
  if (guessedSet && candidateSet) {
    if (candidateSet.includes(guessedSet) || guessedSet.includes(candidateSet)) {
      score += 20 * setConfidence;
      reasons.push(`set match (${Math.round(setConfidence * 100)}% confident)`);
    }
  }

  // Name matching with confidence weighting
  if (guessedName && candidateName) {
    if (candidateName === guessedName) {
      score += 50 * cardConfidence;
      reasons.push(`exact name (${Math.round(cardConfidence * 100)}% confident)`);
    } else if (candidateName.includes(guessedName) || guessedName.includes(candidateName)) {
      score += 35 * cardConfidence;
      reasons.push(`similar name (${Math.round(cardConfidence * 100)}% confident)`);
    }
  }

  // Collector number matching
  if (guessedNumber && candidateNumber && candidateNumber === guessedNumber) {
    score += 30;
    reasons.push("collector number match");
  }

  // Rarity/edition matching (if available from both sides)
  if (cardData.rarity && candidate.rarity) {
    const guessedRarity = normalizeValue(cardData.rarity);
    const candidateRarity = normalizeValue(candidate.rarity);
    if (guessedRarity === candidateRarity) {
      score += 15;
      reasons.push("rarity match");
    }
  }

  // Bonus for multiple strong matches
  if (reasons.filter((r) => r.includes("match")).length >= 3) {
    score += 10;
    reasons.push("multi-field match bonus");
  }

  return {
    score: Math.round(Math.min(Math.max(score, 0), 100) * 10) / 10,
    reasons,
  };
}

function formatJustTcgMatch(card, cardData) {
  const variants = Array.isArray(card.variants) ? card.variants : [];
  const lowestPrice = variants.reduce((lowest, variant) => {
    if (typeof variant.price !== "number") return lowest;
    return lowest === null ? variant.price : Math.min(lowest, variant.price);
  }, null);
  const candidate = {
    id: card.id,
    name: card.name,
    game: card.game,
    set: card.set_name || card.set,
    number: card.number,
    rarity: card.rarity,
    tcgplayerId: card.tcgplayerId,
    lowestPrice,
  };
  const regionalPrices = estimateRegionalPrices(candidate);
  const match = scoreCandidate(cardData, candidate);

  return {
    ...candidate,
    regionalPrices,
    matchScore: match.score,
    matchReasons: match.reasons,
  };
}

async function fetchJustTcgCards(searchQuery) {
  const searchParams = new URLSearchParams({
    q: searchQuery,
    limit: "10",
  });

  const response = await fetch(
    `https://api.justtcg.com/v1/cards?${searchParams.toString()}`,
    {
      headers: {
        "x-api-key": process.env.JUSTTCG_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JustTCG search failed: ${response.status} ${errorText}`);
  }

  const body = await response.json();
  return Array.isArray(body.data) ? body.data : [];
}

async function findCandidates(cardData) {
  if (!process.env.JUSTTCG_API_KEY || !cardData.card) {
    return {
      candidates: [],
      searchQuery: null,
    };
  }

  const primaryQuery = buildJustTcgQuery(cardData);
  const fallbackQuery = cardData.card;
  const rawCards = await fetchJustTcgCards(primaryQuery);
  const fallbackCards =
    rawCards.length > 0 || primaryQuery === fallbackQuery
      ? []
      : await fetchJustTcgCards(fallbackQuery);

  const cardsById = new Map();

  for (const card of [...rawCards, ...fallbackCards]) {
    cardsById.set(card.id, card);
  }

  const candidates = [...cardsById.values()]
    .map((card) => formatJustTcgMatch(card, cardData))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return {
    candidates: await enrichCandidatesWithImages(candidates),
    searchQuery: rawCards.length > 0 ? primaryQuery : fallbackQuery,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { files } = await parseForm(req);
    const cardImage = getUploadedFile(files);

    if (!cardImage) {
      return res.status(400).json({ error: "Missing cardImage upload" });
    }

    const imageBuffer = await readFile(cardImage.filepath);
    const mimeType = cardImage.mimetype || "image/jpeg";
    const base64Image = imageBuffer.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze this trading card image in this order:

1. GAME IDENTIFICATION (CRITICAL - determines everything else):
   - Look at card layout, border style, logo, back-of-card design
   - Determine: Pokemon, Magic: The Gathering (MTG), One Piece, or unknown
   - Confidence: 0-100%

2. SET/EDITION IDENTIFICATION (SECOND PRIORITY):
   - Look for set symbol, holofoil pattern, border design, copyright year
   - Common Pokemon: Base Set, Jungle, Fossil, Neo Genesis, WOTC, Modern era
   - Common MTG: Look at mana symbols, copyright, frame design
   - Common One Piece: Look at set codes (e.g., OP01, OP02)
   - Confidence: 0-100%

3. CARD DETAILS (ONCE GAME & SET KNOWN):
   - Card name (exact spelling if readable)
   - Collector number (e.g., "25/102")
   - Rarity/Edition: common, uncommon, rare, holo, reverse holo, full art, secret rare, etc.
   - Card type/color: (Pokemon type, MTG color, One Piece type)
   - Language (English, Japanese, German, French, etc.)
   - Estimated price range (based on rarity + condition appearance)

Return JSON only with this exact shape:
{
  "game": "Pokemon" | "Magic: The Gathering" | "One Piece" | "Unknown",
  "gameConfidence": number (0-100),
  "set": string | null,
  "setConfidence": number (0-100),
  "card": string | null,
  "cardConfidence": number (0-100),
  "number": string | null,
  "rarity": string | null,
  "editionType": "holo" | "reverse-holo" | "full-art" | "secret-rare" | "normal" | null,
  "cardType": string | null,
  "language": string | null,
  "price": string | null,
  "conditionEstimate": "mint" | "near-mint" | "lightly-played" | "played" | "heavily-played" | null,
  "overallAccuracy": number (0-100),
  "notes": string
}

Use null for unknown fields. Confidence scores help us match against database records.`,
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    const rawText = response.output_text;
    const parsed = parseJsonResponse(rawText);
    let candidates = [];
    let justtcgSearchQuery = null;
    let justtcgError = null;

    try {
      const candidateResult = await findCandidates(parsed);
      candidates = candidateResult.candidates;
      justtcgSearchQuery = candidateResult.searchQuery;
    } catch (error) {
      console.error(error);
      justtcgError = error.message;
    }

    const visionGuess = {
      card: parsed.card,
      game: parsed.game,
      set: parsed.set,
      number: parsed.number,
      language: parsed.language,
      rarity: parsed.rarity,
      editionType: parsed.editionType,
      cardType: parsed.cardType,
      price: parsed.price || "Unknown",
      conditionEstimate: parsed.conditionEstimate,
      overallAccuracy: parsed.overallAccuracy,
      confidenceScores: {
        game: parsed.gameConfidence,
        set: parsed.setConfidence,
        card: parsed.cardConfidence,
      },
      notes: parsed.notes,
    };

    res.status(200).json({
      ...visionGuess,
      image: null,
      visionGuess,
      candidates,
      justtcgMatches: candidates,
      justtcgSearchQuery,
      justtcgError,
      raw: rawText,
    });
  } catch (error) {
    console.error(error);

    const status = error.status || 500;
    const openAiMessage = error.error?.message || error.message;

    res.status(status).json({
      error:
        error.code === "insufficient_quota"
          ? "OpenAI quota exceeded. Check your OpenAI plan and billing."
          : "Failed to analyze card image",
      details: process.env.NODE_ENV === "development" ? openAiMessage : undefined,
      code: error.code,
    });
  }
}
