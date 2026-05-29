import { readFile } from "node:fs/promises";
import formidable from "formidable";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { extractCardDataWithVision } from "./services/openaiVision.js";
import { findLocalCandidates } from "./services/supabaseCards.js";
import { getMatchTarget } from "./utils/cardScoring.js";
import { endTimer, isAnalyzeDebugEnabled, startTimer } from "./utils/analyzeDebug.js";
import { preprocessImage } from "./utils/imagePreprocess.js";

export { estimateRegionalPrices, getPokemonPriceTier } from "./services/pricingService.js";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Vercel production should receive env vars from Project Settings.
  }
}

let openaiClient = null;
let supabaseServerClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  if (!supabaseServerClient) {
    supabaseServerClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: class ApiDisabledWebSocket {},
      },
    });
  }

  return supabaseServerClient;
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
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) reject(error);
      else resolve({ fields, files });
    });
  });
}

function getUploadedFile(files) {
  const file = files.cardImage;
  if (Array.isArray(file)) return file[0];
  return file;
}

function buildVisionGuess(parsed) {
  return {
    card: parsed.card,
    cardName: parsed.cardName,
    displayName: parsed.displayName,
    oracleName: parsed.oracleName,
    game: parsed.game,
    set: parsed.set,
    number: parsed.number,
    localName: parsed.localName,
    romanizedName: parsed.romanizedName,
    englishNameGuess: parsed.englishNameGuess,
    englishNameConfidence: parsed.englishNameConfidence,
    cardNumber: parsed.cardNumber,
    collectorNumber: parsed.collectorNumber,
    cardID: parsed.cardID,
    printedTotal: parsed.printedTotal,
    printed_total: parsed.printed_total,
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
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  startTimer("analyze:total");

  try {
    const openai = getOpenAIClient();
    const supabase = getSupabaseServerClient();

    const { files } = await parseForm(req);
    const cardImage = getUploadedFile(files);

    if (!cardImage) {
      return res.status(400).json({ error: "Missing cardImage upload" });
    }

    startTimer("analyze:image_preprocessing");
    const imageBuffer = await readFile(cardImage.filepath);
    const processedImage = await preprocessImage(imageBuffer, cardImage.mimetype || "image/jpeg");
    const base64Image = processedImage.buffer.toString("base64");
    const imageUrl = `data:${processedImage.mimeType};base64,${base64Image}`;
    endTimer("analyze:image_preprocessing");

    if (isAnalyzeDebugEnabled()) {
      console.info("Analyze image payload", {
        originalBytes: processedImage.originalBytes,
        processedBytes: processedImage.processedBytes,
        reductionPercent: processedImage.reductionPercent,
        optimized: processedImage.optimized,
        skippedReason: processedImage.skippedReason,
        width: processedImage.width,
        height: processedImage.height,
        mimeType: processedImage.mimeType,
      });
    }

    startTimer("analyze:openai_vision");
    const { rawText, parsed } = await extractCardDataWithVision(openai, imageUrl);
    endTimer("analyze:openai_vision");

    let candidates = [];
    let candidateSearchQuery = null;
    let matchTarget = getMatchTarget(parsed);
    let candidateError = null;
    let candidateDedupeDebug = null;

    try {
      const candidateResult = await findLocalCandidates(parsed, supabase);
      candidates = candidateResult.candidates;
      candidateSearchQuery = candidateResult.searchQuery;
      matchTarget = candidateResult.matchTarget || matchTarget;
      candidateDedupeDebug = candidateResult.dedupeDebug || null;
    } catch (error) {
      console.error(error);
      candidateError = error.message;
    }

    startTimer("analyze:response_formatting");
    const visionGuess = buildVisionGuess(parsed);
    const responseBody = {
      ...visionGuess,
      image: null,
      visionGuess,
      candidates,
      candidateSearchQuery,
      matchTarget,
      candidateError,
    };

    if (isAnalyzeDebugEnabled()) {
      responseBody.raw = rawText;
      responseBody.candidateDedupeDebug = candidateDedupeDebug;
    }
    endTimer("analyze:response_formatting");

    res.status(200).json(responseBody);
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
  } finally {
    endTimer("analyze:total");
  }
}
