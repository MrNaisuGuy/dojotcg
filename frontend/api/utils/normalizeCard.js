export function parseJsonResponse(text) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  return JSON.parse(jsonText);
}

export function normalizeValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeNumber(value) {
  const raw = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^#\s*/, "");
  const [base, ...rest] = raw.split("/");
  const normalizedBase = base
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+(?=\d)/, "");
  const normalizedRest = rest.join("/").trim();

  return normalizedRest ? `${normalizedBase}/${normalizedRest}` : normalizedBase;
}

export function normalizePrintedTotal(value) {
  const normalized = normalizeNumber(value);
  const match = normalized.match(/\d+/);

  return match ? Number(match[0]) : null;
}

export function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function parseCollectorNumber(value) {
  const [number, printedTotal] = String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    number,
    normalizedNumber: normalizeNumber(number),
    printedTotal: normalizePrintedTotal(printedTotal),
  };
}

export function getCollectorNumberCandidates(value) {
  const raw = String(value || "").trim();
  const beforeSlash = raw.split("/")[0]?.trim();
  const normalized = normalizeNumber(beforeSlash || raw);
  const paddedMatch = normalized?.match(/^(\d+)([a-z]?)$/i);
  const paddedValues = paddedMatch
    ? [
        `${paddedMatch[1].padStart(2, "0")}${paddedMatch[2]}`,
        `${paddedMatch[1].padStart(3, "0")}${paddedMatch[2]}`,
      ]
    : [];

  return uniqueValues([raw, beforeSlash, normalized, ...paddedValues]);
}

export function getCollectorNumberLookupValues(value) {
  const { number, normalizedNumber } = parseCollectorNumber(value);
  const lookupValues = [number, normalizedNumber];
  const paddedMatch = normalizedNumber?.match(/^(\d+)([a-z]?)$/i);

  if (paddedMatch) {
    const [, digits, suffix] = paddedMatch;
    lookupValues.push(`${digits.padStart(2, "0")}${suffix}`);
    lookupValues.push(`${digits.padStart(3, "0")}${suffix}`);
  }

  return uniqueValues(lookupValues);
}

export function normalizeOnePieceCardId(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/\b(?:OP|ST|EB|PRB)\d{2}-\d{3}\b|\bP-\d{3}\b/);

  return match ? match[0] : null;
}

export function normalizeExtractedName(value, collectorNumber) {
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

export function normalizeExtractedCardData(parsed) {
  const collectorNumber = parsed.collectorNumber || parsed.number || null;
  const set = parsed.setName || parsed.set || parsed.setCode || null;
  const englishName = normalizeExtractedName(parsed.englishNameGuess, collectorNumber);
  const card = normalizeExtractedName(parsed.name || parsed.card, collectorNumber) || englishName;
  const onePieceCardId = normalizeOnePieceCardId(
    parsed.cardID || parsed.cardId || collectorNumber || parsed.setCode,
  );

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
    cardID: onePieceCardId || parsed.cardID || parsed.cardId || null,
  };
}

export function getGameKey(game) {
  const normalized = normalizeValue(game);

  if (normalized.includes("pokemon")) return "pokemon";
  if (normalized.includes("magic") || normalized === "mtg") return "mtg";
  if (normalized.includes("one piece") || normalized.includes("onepiece")) return "onepiece";

  return "unknown";
}
