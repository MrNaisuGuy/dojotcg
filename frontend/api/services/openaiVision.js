import { endTimer, isAnalyzeDebugEnabled, startTimer } from "../utils/analyzeDebug.js";
import {
  normalizeExtractedCardData,
  parseJsonResponse,
} from "../utils/normalizeCard.js";

const INPUT_TEXT = `Extract only visible trading card lookup facts.

Return JSON only.

Do not infer, estimate, guess, or generate:

* market price
* condition
* external_id
* set_id
* database id
* provider id
* setName

Use null when unreadable.

Return exactly:

{
"game": "Pokemon" | "Magic: The Gathering" | "One Piece" | "Unknown",
"cardName": string | null,
"cardNumber": string | null,
"printed_total": number | null,
"setCode": string | null,
"displayName": string | null,
"oracleName": string | null,
"language": string | null,
"rarity": string | null,
"confidence": number
}

General rules:

* Extract only facts visibly printed on the card.
* Prefer exact transcription over interpretation.
* Use null when unreadable.
* Do not infer missing values from game knowledge.
* Confidence should reflect readability of extracted fields, not confidence in card identification.
* Focus on reading the card's identifying information, not rules text.

Language:

* If Japanese text is visible but unreadable:

  * cardName = null
  * language = "Japanese"

* If Korean text is visible but unreadable:

  * cardName = null
  * language = "Korean"

* If non-English text is clearly readable:

  * return the visible name exactly as printed
  * include the detected language

* Do not invent English translations.

* Do not guess names from set codes or card numbers.

* Romanize only when the text is clearly readable.

Pokemon:

* Prioritize reading cardName from the top title area.
* Prioritize reading cardNumber from the bottom border.
* printed_total is the denominator when visible.
* Example:

  * 161/131
  * cardNumber = "161"
  * printed_total = 131
* cardName and cardNumber are the highest priority fields.
* Do not infer set names.

Magic: The Gathering:

* Prioritize reading the large title line at the top.
* displayName is the large title line.
* cardName should equal displayName.
* Do not replace cardName with smaller text beneath the title.
* oracleName is only a second clearly printed card identity or subtitle.
* oracleName must not be:

  * rules text
  * type line
  * flavor text
  * artist text
  * collector information
  * any readable line beneath the title that is not a second card identity
* cardNumber and setCode are usually in the bottom border.
* MTG may have:

  * setCode
  * cardNumber
* MTG does not use printed_total.

One Piece:

* Prioritize reading the printed card ID in the bottom-right border.
* Examples:

  * OP01-016
  * ST10-003
  * EB01-012
* cardNumber is the highest priority field.
* cardName is secondary.
* rarity should only be returned when clearly visible.
* Do not infer variants.
* Do not infer set names.
* Do not infer rarity from set codes or card numbers.`;

const VISION_MODEL = "gpt-5-mini";

function getDataUrlByteSize(imageUrl) {
  const [, base64 = ""] = String(imageUrl || "").split(",", 2);
  if (!base64) return 0;

  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function logVisionRequestSettings({ imageUrl, detail, fallbackTriggered }) {
  if (!isAnalyzeDebugEnabled()) return;

  console.info("analyze:openai_vision_request_settings", {
    model: VISION_MODEL,
    detail,
    maxTokens: null,
    max_output_tokens: null,
    response_format: null,
    fallbackTriggered,
    promptCharacterCount: INPUT_TEXT.length,
    imageByteSize: getDataUrlByteSize(imageUrl),
  });
}

async function requestVision(openai, imageUrl, detail) {
  logVisionRequestSettings({
    imageUrl,
    detail,
    fallbackTriggered: detail === "high",
  });

  return openai.responses.create({
    model: VISION_MODEL,
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
