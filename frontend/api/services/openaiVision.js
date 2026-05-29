import { endTimer, isAnalyzeDebugEnabled, startTimer } from "../utils/analyzeDebug.js";
import {
  normalizeExtractedCardData,
  parseJsonResponse,
} from "../utils/normalizeCard.js";

const INPUT_TEXT = `Extract visible trading-card lookup facts only.
Return JSON only. Use null when unreadable.
Do not infer market price, condition, external_id, set_id, database id, or provider id.

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

If japanese text is visible but not readable, return null for cardName and include "Japanese" for language.
If korean text is visible but not readable, return null for cardName and include "Korean" for language.
Romanize non-English text if the script is clearly readable but the language is not English, and include the detected language. For example, if you see clear Japanese text that you can romanize but cannot confidently translate to English, return the romanized text as cardName and "Japanese" as language. Do not return a romanized name if the script is not clearly readable.
Translate names to English when possible, but do not infer or guess names. For example, if a Pokemon card is in Japanese and you can only read the set code and card number, return those and null for cardName, rather than inferring an English name. If you can read a name but it's in a non-English script, return the name as-is and include the language.
Pokemon: cardName + cardNumber are best. Use printed_total only when visible, such as 161/131.
MTG: displayName is the large title line at the top. cardName should equal displayName. oracleName is only a smaller alternate/reskin/oracle subtitle when it is clearly a second card identity, not rules text, type line, flavor text, or any readable line under the title. MTG may have setCode and cardNumber but no printed_total.
One Piece: printed IDs like OP01-016 or ST10-003 should go in cardNumber. Include rarity only if visibly inferable.
Do not ask for or infer full setName.`;

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
