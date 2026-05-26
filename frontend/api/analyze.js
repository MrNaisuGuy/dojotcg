import { readFile } from "node:fs/promises";
import formidable from "formidable";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const FALLBACK_CARD_IMAGE = "/images/dojobird.png";
const JUSTTCG_QUERY_LIMIT = 4;
const DEBUG_IMAGE_LOOKUP = process.env.DEBUG_IMAGE_LOOKUP === "true";
const ENABLE_EXTERNAL_CARD_LOOKUPS = process.env.ENABLE_EXTERNAL_CARD_LOOKUPS === "true";
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

function getJustTcgApiKey() {
  return process.env.JUSTTCG_API_KEY?.trim();
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

function compactQuery(parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(" ");
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

function normalizeExtractedName(value, collectorNumber) {
  let name = String(value || "").trim();
  const { number } = parseCollectorNumber(collectorNumber);

  if (number) {
    name = name
      .replace(new RegExp(`\\s*#?${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "")
      .trim();
  }

  return name
    .replace(/\s+-\s+#?\d+[a-z]?(?:\/\d+)?\s*$/i, "")
    .replace(/\s+#?\d+[a-z]?(?:\/\d+)?\s*$/i, "")
    .trim() || null;
}

function normalizeExtractedCardData(parsed) {
  const collectorNumber = parsed.collectorNumber || parsed.number || null;
  const set = parsed.setName || parsed.set || parsed.setCode || null;
  const englishName = normalizeExtractedName(parsed.englishNameGuess, collectorNumber);
  const card = normalizeExtractedName(parsed.name || parsed.card, collectorNumber) || englishName;

  return {
    ...parsed,
    name: card,
    card,
    localName: parsed.localName || null,
    romanizedName: parsed.romanizedName || null,
    englishNameGuess: englishName,
    englishNameConfidence: parsed.englishNameConfidence ?? null,
    number: collectorNumber,
    collectorNumber,
    printedTotal: parsed.printedTotal ?? null,
    set,
    setName: parsed.setName || null,
    setCode: parsed.setCode || null,
    cardID: parsed.cardID || parsed.cardId || null,
  };
}

function getSetCandidates(cardData) {
  return uniqueValues([cardData.setCode, cardData.setName, cardData.set]);
}

function buildJustTcgQueries(cardData) {
  const name = cardData.englishNameGuess || cardData.card;
  const collectorNumber = cardData.collectorNumber || cardData.number;
  const cardID = cardData.cardID || cardData.cardId;
  const { number, printedTotal } = parseCollectorNumber(collectorNumber);
  const total = cardData.printedTotal || printedTotal;
  const setCandidates = getSetCandidates(cardData);
  const visibleText = Array.isArray(cardData.visibleText) ? cardData.visibleText : [];
  const usefulVisibleText = visibleText
    .filter((text) => normalizeValue(text).length >= 4)
    .slice(0, 3);
  const setNameQueries = setCandidates.flatMap((setValue) => [
    compactQuery([setValue, name, number, total]),
    compactQuery([setValue, name, number]),
    compactQuery([setValue, name, collectorNumber]),
    compactQuery([setValue, name]),
  ]);

  return uniqueValues([
    ...setNameQueries,
    compactQuery([name, number, total]),
    compactQuery([name, number]),
    compactQuery([name, collectorNumber]),
    cardID,
    compactQuery([name, cardID]),
    compactQuery([collectorNumber, total]),
    name,
    ...usefulVisibleText.map((text) => compactQuery([name, text])),
  ]).slice(0, JUSTTCG_QUERY_LIMIT);
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

function getScryfallImageUrl(card) {
  const imageUris = card.image_uris || card.card_faces?.[0]?.image_uris;
  return imageUris?.normal || imageUris?.large || imageUris?.small || null;
}

function getOnePieceCardId(candidate) {
  const possibleIds = [
    candidate.cardID,
    candidate.cardId,
    candidate.collectorNumber,
    candidate.number,
    candidate.setCode,
    candidate.set,
    candidate.id,
  ].filter(Boolean);

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
  const { number, normalizedNumber, printedTotal } = parseCollectorNumber(
    candidate.number || candidate.collectorNumber,
  );
  const extractedNumber = parseCollectorNumber(candidate.collectorNumber);
  const targetPrintedTotal = printedTotal || candidate.printedTotal || extractedNumber.printedTotal;

  if (!candidate.name || !number || !targetPrintedTotal) return null;

  const query = `name:"${quotePokemonQueryValue(candidate.name)}" number:"${quotePokemonQueryValue(number)}" set.printedTotal:${Number(targetPrintedTotal)}`;
  const debug = {
    provider: "pokemontcg.io",
    query,
    candidateName: candidate.name,
    candidateSet: candidate.set,
    candidateNumber: candidate.number,
    targetPrintedTotal,
    resultCount: 0,
    topScore: null,
    topResult: null,
    accepted: false,
  };
  const headers = {};

  if (process.env.POKEMONTCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  }

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
  debug.resultCount = cards.length;
  const rankedCards = cards
    .map((card) => {
      let score = 0;
      const numberMatches = normalizedNumber && normalizeNumber(card.number) === normalizedNumber;
      const nameMatches = candidate.name && normalizeValue(card.name) === normalizeValue(candidate.name);
      const nameContains = candidate.name && normalizeValue(card.name).includes(normalizeValue(candidate.name));
      const printedTotalMatches = card.set?.printedTotal === Number(targetPrintedTotal);

      if (numberMatches) score += 50;
      if (printedTotalMatches) score += 40;
      if (nameMatches) score += 35;
      if (nameContains) score += 18;

      return {
        card,
        score,
        hasSafeIdentityMatch: Boolean(numberMatches && printedTotalMatches && (nameMatches || nameContains)),
      };
    })
    .sort((a, b) => b.score - a.score);
  const bestMatch = rankedCards[0];
  debug.topScore = bestMatch?.score ?? null;
  debug.topResult = bestMatch?.card
    ? {
        id: bestMatch.card.id,
        name: bestMatch.card.name,
        number: bestMatch.card.number,
        setName: bestMatch.card.set?.name,
        printedTotal: bestMatch.card.set?.printedTotal,
        total: bestMatch.card.set?.total,
      }
    : null;
  const card = bestMatch?.hasSafeIdentityMatch || bestMatch?.score >= 85 ? bestMatch.card : null;
  const imageUrl = card?.images?.large || null;

  if (imageUrl) {
    debug.accepted = true;

    return {
      imageUrl,
      imageSource: `pokemontcg.io (${card.set.name} #${card.number})`,
      imageLookupDebug: DEBUG_IMAGE_LOOKUP ? debug : undefined,
    };
  }

  return DEBUG_IMAGE_LOOKUP ? { imageUrl: null, imageSource: null, imageLookupDebug: debug } : null;
}

async function fetchScryfallImage(candidate) {
  const collectorNumbers = getCollectorNumberCandidates(candidate.collectorNumber || candidate.number);
  if (collectorNumbers.length === 0) return null;

  const escapedName = candidate.name?.replace(/"/g, '\\"');
  const queries = uniqueValues([
    ...collectorNumbers.map((number) => `cn:${number}`),
    ...(escapedName ? collectorNumbers.map((number) => `!"${escapedName}" cn:${number}`) : []),
  ]);
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
    const cards = Array.isArray(body?.data) ? body.data : [];
    const card =
      cards.find((item) => normalizeValue(item.name) === normalizeValue(candidate.name)) ||
      cards.find((item) => collectorNumbers.some((number) => normalizeNumber(item.collector_number) === normalizeNumber(number))) ||
      cards[0];
    const imageUrl = card ? getScryfallImageUrl(card) : null;

    if (imageUrl) {
      return {
        imageUrl,
        imageSource: "Scryfall",
      };
    }
  }

  return null;
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
        imageLookupDebug: imageData?.imageLookupDebug,
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
  const guessedSetCode = normalizeValue(cardData.setCode);
  const guessedSetName = normalizeValue(cardData.setName);
  const candidateSet = normalizeValue(candidate.set);
  const guessedNumber = normalizeNumber(cardData.number);
  const candidateNumber = normalizeNumber(candidate.number);
  const parsedGuessedNumber = parseCollectorNumber(cardData.collectorNumber || cardData.number);
  const parsedCandidateNumber = parseCollectorNumber(candidate.number);
  const guessedPrintedTotal = cardData.printedTotal || parsedGuessedNumber.printedTotal;

  // Get OpenAI confidence scores (0-100), default to 50 if not provided
  const gameConfidence = (cardData.confidenceScores?.game ?? cardData.gameConfidence ?? 50) / 100;
  const setConfidence = (cardData.confidenceScores?.set ?? cardData.setConfidence ?? 50) / 100;
  const cardConfidence = (cardData.confidenceScores?.card ?? cardData.cardConfidence ?? 50) / 100;
  const collectorNumberConfidence =
    (cardData.confidenceScores?.collectorNumber ?? cardData.collectorNumberConfidence ?? 50) / 100;

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

  if (guessedSetCode && candidateSet && candidateSet.includes(guessedSetCode)) {
    score += 22 * setConfidence;
    reasons.push(`set code match (${Math.round(setConfidence * 100)}% confident)`);
  }

  if (guessedSetName && candidateSet) {
    if (candidateSet.includes(guessedSetName) || guessedSetName.includes(candidateSet)) {
      score += 18 * setConfidence;
      reasons.push(`set name match (${Math.round(setConfidence * 100)}% confident)`);
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
    score += 40 * collectorNumberConfidence;
    reasons.push(`collector number match (${Math.round(collectorNumberConfidence * 100)}% confident)`);
  } else if (
    parsedGuessedNumber.normalizedNumber &&
    parsedCandidateNumber.normalizedNumber &&
    parsedCandidateNumber.normalizedNumber === parsedGuessedNumber.normalizedNumber
  ) {
    score += 32 * collectorNumberConfidence;
    reasons.push(`collector number base match (${Math.round(collectorNumberConfidence * 100)}% confident)`);
  }

  if (
    guessedPrintedTotal &&
    parsedCandidateNumber.printedTotal &&
    Number(guessedPrintedTotal) === parsedCandidateNumber.printedTotal
  ) {
    score += 10;
    reasons.push("printed total match");
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

function getLocalLookupNames(cardData) {
  return uniqueValues([cardData.englishNameGuess, cardData.card, cardData.name]);
}

function formatSupabaseCardMatch(card, cardData) {
  const tcgplayerId = card.raw?.tcgplayer?.url?.match(/product\/(\d+)/)?.[1] || null;
  const lowestPrice = typeof card.price_usd === "number" ? card.price_usd : null;
  const candidate = {
    id: card.id,
    externalId: card.external_id,
    name: card.name,
    game: card.game,
    set: card.set_name,
    setId: card.set_id,
    number: card.number,
    collectorNumber: cardData.collectorNumber,
    printedTotal: card.printed_total,
    rarity: card.rarity,
    tcgplayerId,
    lowestPrice,
    regionalPrices: {
      us: lowestPrice,
      jp: null,
      kr: null,
      basePrice: lowestPrice,
      characterModifier: 1,
    },
    priceSource: card.price_source,
    priceVariant: card.price_variant,
    priceUpdatedAt: card.price_updated_at,
    imageUrl: card.image_url || FALLBACK_CARD_IMAGE,
    imageSource: card.image_url ? "Supabase card catalog" : "DojoTCG fallback",
    dataSource: "Supabase card catalog",
    raw: card.raw,
  };
  const match = scoreCandidate(cardData, candidate);

  return {
    ...candidate,
    matchScore: match.score,
    matchReasons: match.reasons,
  };
}

async function findLocalCandidates(cardData) {
  const supabase = getSupabaseServerClient();
  const gameKey = getGameKey(cardData.game);
  const { number, printedTotal } = parseCollectorNumber(cardData.collectorNumber || cardData.number);
  const targetPrintedTotal = cardData.printedTotal || printedTotal;
  const names = getLocalLookupNames(cardData);

  if (!supabase || !gameKey || names.length === 0 || !number) {
    return {
      candidates: [],
      searchQuery: null,
    };
  }

  const queryParts = [
    `game=${gameKey}`,
    `name in (${names.join(", ")})`,
    `number=${number}`,
    targetPrintedTotal ? `printed_total=${targetPrintedTotal}` : null,
  ].filter(Boolean);
  let query = supabase
    .from("cards")
    .select("id,external_id,game,name,set_name,set_id,number,printed_total,rarity,image_url,price_usd,price_source,price_variant,price_updated_at,raw")
    .eq("game", gameKey)
    .in("name", names)
    .eq("number", number)
    .limit(10);

  if (targetPrintedTotal) {
    query = query.eq("printed_total", Number(targetPrintedTotal));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const candidates = (data || [])
    .map((card) => formatSupabaseCardMatch(card, cardData))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return {
    candidates,
    searchQuery: queryParts.join(" | "),
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
    name: normalizeExtractedName(card.name, card.number) || card.name,
    rawName: card.name,
    game: card.game,
    set: card.set_name || card.set,
    number: card.number,
    cardID: cardData.cardID,
    collectorNumber: cardData.collectorNumber,
    printedTotal: cardData.printedTotal,
    setCode: cardData.setCode,
    setName: cardData.setName,
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
  const apiKey = getJustTcgApiKey();
  const searchParams = new URLSearchParams({
    q: searchQuery,
    limit: "10",
  });

  const response = await fetch(
    `https://api.justtcg.com/v1/cards?${searchParams.toString()}`,
    {
      headers: {
        "x-api-key": apiKey,
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
  const localResult = await findLocalCandidates(cardData);

  if (localResult.candidates.length > 0 || !ENABLE_EXTERNAL_CARD_LOOKUPS) {
    return localResult;
  }

  const apiKey = getJustTcgApiKey();

  if (!apiKey || !cardData.card) {
    return {
      candidates: [],
      searchQuery: null,
    };
  }

  const queries = buildJustTcgQueries(cardData);
  console.info("JustTCG lookup", {
    keyLength: apiKey.length,
    keyPrefix: apiKey.slice(0, 4),
    queryCount: queries.length,
  });
  const searchResults = await Promise.allSettled(
    queries.map(async (query) => ({
      query,
      cards: await fetchJustTcgCards(query),
    })),
  );
  const successfulResults = searchResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const firstError = searchResults.find((result) => result.status === "rejected")?.reason;

  if (successfulResults.length === 0 && firstError) {
    throw firstError;
  }

  const cardsById = new Map();

  for (const { cards } of successfulResults) {
    for (const card of cards) {
      cardsById.set(card.id, card);
    }
  }

  const candidates = [...cardsById.values()]
    .map((card) => formatJustTcgMatch(card, cardData))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return {
    candidates: await enrichCandidatesWithImages(candidates),
    searchQuery: successfulResults.map((result) => result.query).join(" | "),
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
              text: `Extract only visible identifying facts from this trading card image. Do not guess a database id, product id, market price, or condition. If a field is not readable, use null and mention it in uncertainFields.

Prioritize exact text and printed identifiers:
1. Identify the game from visual layout and printed branding: Pokemon, Magic: The Gathering, One Piece, or Unknown.
2. Read the exact card name if visible.
3. For Pokemon, first try to extract the practical lookup pair: exact card name + collector number.
   - Example: if the card says "Umbreon" and "#161", return name "Umbreon" and collectorNumber "161".
   - If the card shows a fraction like "161/203", return collectorNumber "161/203" and printedTotal 203.
   - If only the top/left number is readable, return that number instead of guessing the total.
4. If the Pokemon card name is Japanese or Korean:
   - Put the printed non-English name in localName.
   - Put a romanized reading in romanizedName when possible.
   - Infer the likely official English Pokemon TCG card name in englishNameGuess.
   - Do not translate attack names or ability names as the card name.
   - Prefer the Pokemon species/card title printed at the top.
   - Return null for englishNameGuess if uncertain.
5. Read the collector/card number exactly as printed for all games.
   - If fraction card number is top number and printed total is bottom number.
   - Collector number can be the fraction or following examples.
   - Pokemon examples: "25/102", "SVP 001", "TG05/TG30" 
   - Magic examples: "123/281", "123", "123★"
   - One Piece examples: "OP01-001", "ST10-003", "P-001"
6. Read any set code, set name, set symbol text, printed total, language, rarity, foil/treatment, copyright year, and useful visible text fragments.
7. Confidence scores should describe readability, not whether a database match exists.

Return JSON only with this exact shape:
{
  "game": "Pokemon" | "Magic: The Gathering" | "One Piece" | "Unknown",
  "gameConfidence": number,
  "name": string | null,
  "nameConfidence": number,
  "localName": string | null,
  "romanizedName": string | null,
  "englishNameGuess": string | null,
  "englishNameConfidence": number,
  "collectorNumber": string | null,
  "collectorNumberConfidence": number,
  "setCode": string | null,
  "setName": string | null,
  "setConfidence": number,
  "printedTotal": number | null,
  "language": string | null,
  "rarity": string | null,
  "foilTreatment": "holo" | "reverse-holo" | "full-art" | "secret-rare" | "normal" | null,
  "cardType": string | null,
  "copyrightYear": number | null,
  "visibleText": string[],
  "uncertainFields": string[],
  "overallAccuracy": number,
  "cardID": string | null,
  "notes": string
}

Use numbers from 0 to 100 for confidence fields. Keep visibleText short and only include text you can see on the card.`,
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
    const parsed = normalizeExtractedCardData(parseJsonResponse(rawText));
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
      localName: parsed.localName,
      romanizedName: parsed.romanizedName,
      englishNameGuess: parsed.englishNameGuess,
      englishNameConfidence: parsed.englishNameConfidence,
      collectorNumber: parsed.collectorNumber,
      cardID: parsed.cardID,
      printedTotal: parsed.printedTotal,
      setCode: parsed.setCode,
      setName: parsed.setName,
      language: parsed.language,
      rarity: parsed.rarity,
      editionType: parsed.foilTreatment || parsed.editionType,
      foilTreatment: parsed.foilTreatment,
      cardType: parsed.cardType,
      price: parsed.price || "Unknown",
      conditionEstimate: parsed.conditionEstimate,
      copyrightYear: parsed.copyrightYear,
      visibleText: parsed.visibleText || [],
      uncertainFields: parsed.uncertainFields || [],
      overallAccuracy: parsed.overallAccuracy,
      confidenceScores: {
        game: parsed.gameConfidence,
        set: parsed.setConfidence,
        card: parsed.nameConfidence ?? parsed.cardConfidence,
        englishName: parsed.englishNameConfidence,
        collectorNumber: parsed.collectorNumberConfidence,
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
