import { readFile } from "node:fs/promises";
import formidable from "formidable";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY && process.loadEnvFile) {
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

    res.status(200).json({
      card: parsed.card,
      game: parsed.game,
      language: parsed.language,
      set: parsed.set,
      number: parsed.number,
      price: parsed.price || "Unknown",
      accuracy: parsed.accuracy,
      notes: parsed.notes,
      image: null,
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
