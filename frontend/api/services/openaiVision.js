import { isAnalyzeDebugEnabled } from "../utils/analyzeDebug.js";
import {
  normalizeExtractedCardData,
  parseJsonResponse,
} from "../utils/normalizeCard.js";

const INPUT_TEXT = `Extract only visible lookup fields from this trading card image.

Rules:
- Return JSON only.
- Do not infer market price, condition, product id, database id, or variant.
- Use null for unreadable fields.
- Confidence scores are visual readability scores from 0 to 100.
- Prefer exact printed identifiers over names.

Return exactly:
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
  "printedTotal": number | null,
  "setCode": string | null,
  "setName": string | null,
  "setConfidence": number,
  "language": string | null,
  "rarity": string | null,
  "cardType": string | null,
  "cardID": string | null,
  "visibleText": string[],
  "uncertainFields": string[],
  "overallAccuracy": number,
  "notes": string
}

Pokemon: for Japanese/Korean cards, localName is the printed title and englishNameGuess is the likely official English card name only if confident.
One Piece: inspect the bottom-right first; if an ID like OP01-001, ST10-003, EB01-001, PRB01-001, or P-001 is visible, put it in collectorNumber and cardID.
Magic: prefer collector number and set code over rules/flavor text.
Keep visibleText short, max 5 items.`;

async function requestVision(openai, imageUrl, detail) {
  return openai.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: INPUT_TEXT,
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail,
          },
        ],
      },
    ],
  });
}

export async function extractCardDataWithVision(openai, imageUrl) {
  const autoResponse = await requestVision(openai, imageUrl, "auto");

  try {
    return {
      rawText: autoResponse.output_text,
      parsed: normalizeExtractedCardData(parseJsonResponse(autoResponse.output_text)),
      detail: "auto",
    };
  } catch (error) {
    if (isAnalyzeDebugEnabled()) {
      console.warn("Auto-detail vision parse failed; retrying with high detail.", error);
    }
  }

  const highResponse = await requestVision(openai, imageUrl, "high");

  return {
    rawText: highResponse.output_text,
    parsed: normalizeExtractedCardData(parseJsonResponse(highResponse.output_text)),
    detail: "high",
  };
}
