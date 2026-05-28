import { endTimer, isAnalyzeDebugEnabled, startTimer } from "../utils/analyzeDebug.js";
import {
  normalizeExtractedCardData,
  parseJsonResponse,
} from "../utils/normalizeCard.js";

const INPUT_TEXT = `Extract only visible lookup fields from this trading card image.

Rules:

Return JSON only.
Do not infer:
market price
condition
product id
database id
provider id
external_id
set_id
hidden/internal identifiers
Use null for unreadable fields.
Confidence scores are visual readability scores from 0 to 100.
Prefer exact printed identifiers over guessed names.
Do not invent missing values.
Keep visibleText short and useful.

Game-specific guidance:

Pokemon:

Prioritize:
card name
collector number
printed total
rarity
visible set name
A value like "161/131" should become:
collectorNumber: "161"
printedTotal: 131
Do not treat visible set text as set_id.

One Piece:

Prioritize the printed card ID at the bottom-right.
IDs may look like:
OP01-016
ST10-003
EB01-012
PRB01-001
Read the entire printed ID carefully.

Magic: The Gathering:

Prioritize:
card name
collector number
set code
rarity
visible frame/treatment clues
Variant clues may include:
showcase
borderless
retro frame
extended art
pixel art
foil appearance
Same-name variants may exist.

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
"visibleText": string[],
"uncertainFields": string[],
"overallAccuracy": number,
"notes": string
}

Pokemon:
- Prioritize card name, collector number, printed total, rarity, and visible set name.
- For Japanese/Korean cards, localName is the printed title.
- englishNameGuess is the likely official English card name only if confident.
- A value like "161/131" should become:
  - collectorNumber: "161"
  - printedTotal: 131
- Do not treat visible set text as set_id.

One Piece:
- Inspect the bottom-right first.
- If a printed ID like OP01-001, ST10-003, EB01-001, PRB01-001, or P-001 is visible, put it in collectorNumber.
- Read the entire printed ID carefully.

Magic: The Gathering:
- Prefer collector number and set code over rules/flavor text.
- Prioritize card name, collector number, set code, rarity, and visible frame/treatment clues.
- Variant clues may include showcase, borderless, retro frame, extended art, pixel art, or foil appearance.
- Same-name variants may exist.

visibleText:
- Keep visibleText short.
- Max 5 items.`;

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
  startTimer("analyze:openai_first_vision");
  let autoResponse;

  try {
    autoResponse = await requestVision(openai, imageUrl, "auto");
  } finally {
    endTimer("analyze:openai_first_vision");
  }

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

  startTimer("analyze:openai_fallback_high_detail");
  let highResponse;

  try {
    highResponse = await requestVision(openai, imageUrl, "high");
  } finally {
    endTimer("analyze:openai_fallback_high_detail");
  }

  return {
    rawText: highResponse.output_text,
    parsed: normalizeExtractedCardData(parseJsonResponse(highResponse.output_text)),
    detail: "high",
  };
}
