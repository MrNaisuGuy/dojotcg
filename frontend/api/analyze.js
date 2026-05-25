import { readFile } from "node:fs/promises";
import formidable from "formidable";
import OpenAI from "openai";

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

  if (guessedName && candidateName === guessedName) {
    score += 45;
    reasons.push("exact name");
  } else if (
    guessedName &&
    candidateName &&
    (candidateName.includes(guessedName) || guessedName.includes(candidateName))
  ) {
    score += 30;
    reasons.push("similar name");
  }

  if (guessedGame && candidateGame && candidateGame === guessedGame) {
    score += 15;
    reasons.push("same game");
  }

  if (guessedSet && candidateSet && candidateSet.includes(guessedSet)) {
    score += 15;
    reasons.push("set match");
  }

  if (guessedNumber && candidateNumber && candidateNumber === guessedNumber) {
    score += 25;
    reasons.push("collector number match");
  }

  return {
    score: Math.min(score, 100),
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
  const match = scoreCandidate(cardData, candidate);

  return {
    ...candidate,
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
    candidates,
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
              text: `Identify this trading card from the uploaded image. Prioritize finding what card game it is from (Pokemon, Magic: The Gathering, One Piece, etc) and the card name. Then try to find the language, set, and number if available. Finally, provide an estimated price range and an accuracy percentage for your analysis.

Return JSON only with this exact shape:
{
  "card": string | null,
  "game": "Pokemon" | "Magic: The Gathering" | "One Piece" | "This TCG Is Not Supported",
  "language": string | null,
  "set": string | null,
  "number": string | null,
  "price": string | null,
  "accuracy": number,
  "notes": string
}

Use null when you are not sure. Accuracy should be a percentage from 0 to 100.`,
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
      language: parsed.language,
      set: parsed.set,
      number: parsed.number,
      price: parsed.price || "Unknown",
      accuracy: parsed.accuracy,
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
