import {
  getCollectorNumberLookupValues,
  getGameKey,
  normalizeNumber,
  normalizeOnePieceCardId,
  normalizePrintedTotal,
  normalizeValue,
  parseCollectorNumber,
  uniqueValues,
} from "./normalizeCard.js";

export function buildMatchContext(cardData) {
  const parsedNumber = parseCollectorNumber(cardData.collectorNumber || cardData.number);
  const printedTotal = normalizePrintedTotal(cardData.printedTotal) || parsedNumber.printedTotal;
  const externalId = cardData.externalId || cardData.external_id || cardData.cardID || cardData.cardId;

  return {
    gameKey: getGameKey(cardData.game),
    externalId: normalizeValue(externalId),
    normalizedName: normalizeValue(cardData.card),
    normalizedGame: normalizeValue(cardData.game),
    normalizedSet: normalizeValue(cardData.set),
    normalizedSetId: normalizeValue(cardData.setId || cardData.set_id || cardData.setCode),
    normalizedSetCode: normalizeValue(cardData.setCode),
    normalizedSetName: normalizeValue(cardData.setName),
    normalizedNumber: normalizeNumber(cardData.number),
    parsedNumber,
    printedTotal,
    language: normalizeValue(cardData.language),
    rarity: normalizeValue(cardData.rarity),
    onePieceCardId: normalizeOnePieceCardId(
      cardData.cardID || cardData.cardId || cardData.collectorNumber || cardData.number,
    ),
    cardType: normalizeValue(cardData.cardType),
    gameConfidence: (cardData.confidenceScores?.game ?? cardData.gameConfidence ?? 50) / 100,
    setConfidence: (cardData.confidenceScores?.set ?? cardData.setConfidence ?? 50) / 100,
    cardConfidence: (cardData.confidenceScores?.card ?? cardData.cardConfidence ?? 50) / 100,
    collectorNumberConfidence:
      (cardData.confidenceScores?.collectorNumber ?? cardData.collectorNumberConfidence ?? 50) / 100,
  };
}

export function buildCandidateMatchData(candidate) {
  const parsedNumber = parseCollectorNumber(candidate.number);
  const externalId = candidate.externalId || candidate.external_id || candidate.cardID || candidate.cardId;

  return {
    gameKey: getGameKey(candidate.game),
    externalId: normalizeValue(externalId),
    normalizedName: normalizeValue(candidate.name),
    normalizedGame: normalizeValue(candidate.game),
    normalizedSet: normalizeValue(candidate.set),
    normalizedSetId: normalizeValue(candidate.setId || candidate.set_id),
    normalizedNumber: normalizeNumber(candidate.number),
    parsedNumber,
    printedTotal: normalizePrintedTotal(candidate.printedTotal) || parsedNumber.printedTotal,
    language: normalizeValue(candidate.language),
    rarity: normalizeValue(candidate.rarity),
    onePieceCardId: normalizeOnePieceCardId(
      candidate.externalId || candidate.cardID || candidate.cardId || candidate.id || candidate.number,
    ),
    cardType: normalizeValue(candidate.cardType),
  };
}

function hasValue(value) {
  return Boolean(value || value === 0);
}

function valuesConflict(left, right) {
  return hasValue(left) && hasValue(right) && left !== right;
}

function includesEither(left, right) {
  return hasValue(left) && hasValue(right) && (left.includes(right) || right.includes(left));
}

export function scoreCandidate(matchContext, candidateMatchData) {
  const reasons = [];
  const matchedFields = [];
  const conflictingFields = [];
  const scoreBreakdown = [];

  const gameMatch = Boolean(
    (matchContext.gameKey &&
      candidateMatchData.gameKey &&
      matchContext.gameKey !== "unknown" &&
      candidateMatchData.gameKey === matchContext.gameKey) ||
      (matchContext.normalizedGame &&
        candidateMatchData.normalizedGame &&
        candidateMatchData.normalizedGame === matchContext.normalizedGame),
  );
  const externalIdMatch = Boolean(
    (matchContext.externalId && candidateMatchData.externalId && matchContext.externalId === candidateMatchData.externalId) ||
      (matchContext.onePieceCardId && candidateMatchData.onePieceCardId && matchContext.onePieceCardId === candidateMatchData.onePieceCardId),
  );
  const setIdMatch = Boolean(
    matchContext.normalizedSetId &&
      candidateMatchData.normalizedSetId &&
      candidateMatchData.normalizedSetId === matchContext.normalizedSetId,
  );
  const setNameMatch = Boolean(
    includesEither(candidateMatchData.normalizedSet, matchContext.normalizedSet) ||
      includesEither(candidateMatchData.normalizedSet, matchContext.normalizedSetCode) ||
      includesEither(candidateMatchData.normalizedSet, matchContext.normalizedSetName)
  );
  const exactNameMatch = Boolean(
    matchContext.normalizedName &&
      candidateMatchData.normalizedName &&
      candidateMatchData.normalizedName === matchContext.normalizedName,
  );
  const fuzzyNameMatch = Boolean(
    !exactNameMatch &&
      includesEither(candidateMatchData.normalizedName, matchContext.normalizedName)
  );
  const exactNumberMatch = Boolean(
    matchContext.normalizedNumber &&
      candidateMatchData.normalizedNumber &&
      candidateMatchData.normalizedNumber === matchContext.normalizedNumber,
  );
  const baseNumberMatch = Boolean(
    !exactNumberMatch &&
      matchContext.parsedNumber.normalizedNumber &&
      candidateMatchData.parsedNumber.normalizedNumber &&
      candidateMatchData.parsedNumber.normalizedNumber === matchContext.parsedNumber.normalizedNumber
  );
  const numberMatch = exactNumberMatch || baseNumberMatch;
  const printedTotalMatch = Boolean(
    matchContext.printedTotal &&
      candidateMatchData.printedTotal &&
      matchContext.printedTotal === candidateMatchData.printedTotal
  );
  const languageMatch = Boolean(matchContext.language && candidateMatchData.language && matchContext.language === candidateMatchData.language);
  const rarityMatch = Boolean(matchContext.rarity && candidateMatchData.rarity && matchContext.rarity === candidateMatchData.rarity);
  const cardTypeMatch = Boolean(matchContext.cardType && candidateMatchData.cardType && matchContext.cardType === candidateMatchData.cardType);
  const nameConflict = Boolean(
    matchContext.normalizedName &&
      candidateMatchData.normalizedName &&
      !exactNameMatch &&
      !fuzzyNameMatch
  );
  const setConflict = Boolean(
    (valuesConflict(matchContext.normalizedSetId, candidateMatchData.normalizedSetId) ||
      (matchContext.normalizedSet && candidateMatchData.normalizedSet && !setNameMatch)) &&
      !setIdMatch &&
      !setNameMatch
  );

  if (gameMatch) matchedFields.push("game");
  if (externalIdMatch) matchedFields.push("external_id");
  if (setIdMatch) matchedFields.push("set_id");
  if (setNameMatch) matchedFields.push("set_name");
  if (exactNameMatch) matchedFields.push("name");
  if (fuzzyNameMatch) matchedFields.push("similar_name");
  if (exactNumberMatch) matchedFields.push("number");
  if (baseNumberMatch) matchedFields.push("number_base");
  if (printedTotalMatch) matchedFields.push("printed_total");
  if (languageMatch) matchedFields.push("language");
  if (rarityMatch) matchedFields.push("rarity");
  if (cardTypeMatch) matchedFields.push("card_type");

  if (!gameMatch && valuesConflict(matchContext.normalizedGame, candidateMatchData.normalizedGame)) conflictingFields.push("game");
  if (valuesConflict(matchContext.externalId, candidateMatchData.externalId)) conflictingFields.push("external_id");
  if (valuesConflict(matchContext.onePieceCardId, candidateMatchData.onePieceCardId)) conflictingFields.push("one_piece_card_id");
  if (setConflict) conflictingFields.push("set");
  if (nameConflict) conflictingFields.push("name");
  if (valuesConflict(matchContext.normalizedNumber, candidateMatchData.normalizedNumber)) conflictingFields.push("number");
  if (valuesConflict(matchContext.printedTotal, candidateMatchData.printedTotal)) conflictingFields.push("printed_total");
  if (valuesConflict(matchContext.language, candidateMatchData.language)) conflictingFields.push("language");
  if (valuesConflict(matchContext.rarity, candidateMatchData.rarity)) conflictingFields.push("rarity");

  let confidence = 0.2;
  let confidenceReason = "weak text match";

  if (externalIdMatch) {
    confidence = 0.97;
    confidenceReason = "exact external_id match";
  } else if (gameMatch && setIdMatch && numberMatch) {
    confidence = 0.94;
    confidenceReason = "exact game + set_id + number match";
  } else if (gameMatch && numberMatch && exactNameMatch) {
    confidence = 0.88;
    confidenceReason = "exact game + number + name match";
  } else if (gameMatch && exactNameMatch && (setIdMatch || setNameMatch)) {
    confidence = 0.82;
    confidenceReason = "exact game + name + set match";
  } else if (gameMatch && fuzzyNameMatch) {
    confidence = 0.55;
    confidenceReason = "fuzzy name + game match";
  } else if (gameMatch && numberMatch) {
    confidence = 0.08;
    confidenceReason = "collector number only match";
  } else if (gameMatch) {
    confidence = 0.05;
    confidenceReason = "game only match";
  }

  scoreBreakdown.push({ reason: confidenceReason, delta: confidence });

  const adjustments = [
    [languageMatch, 0.03, "language match"],
    [rarityMatch, 0.02, "rarity match"],
    [setNameMatch && !setIdMatch, 0.02, "set name match"],
    [printedTotalMatch && !numberMatch, 0.02, "printed total match"],
    [cardTypeMatch, 0.02, "card type match"],
  ];

  for (const [applies, delta, reason] of adjustments) {
    if (applies) {
      confidence += delta;
      reasons.push(reason);
      scoreBreakdown.push({ reason, delta });
    }
  }

  const conflictPenalties = {
    game: -0.25,
    external_id: -0.25,
    one_piece_card_id: -0.25,
    set: -0.18,
    name: -0.22,
    number: -0.18,
    printed_total: -0.08,
    language: -0.04,
    rarity: -0.04,
  };

  for (const field of conflictingFields) {
    const delta = conflictPenalties[field] ?? -0.1;
    confidence += delta;
    reasons.push(`${field.replaceAll("_", " ")} conflict`);
    scoreBreakdown.push({ reason: `${field} conflict`, delta });
  }

  if (numberMatch && !exactNameMatch && !fuzzyNameMatch && !setIdMatch && !setNameMatch) {
    const cap = nameConflict || setConflict ? 0.08 : 0.15;

    if (confidence > cap) {
      scoreBreakdown.push({ reason: "collector number only cap", delta: cap - confidence });
      confidence = cap;
    }
  }

  if ((nameConflict || setConflict || conflictingFields.includes("number") || conflictingFields.includes("printed_total")) && confidence > 0.7) {
    scoreBreakdown.push({ reason: "identity conflict cap", delta: 0.7 - confidence });
    confidence = 0.7;
  }

  if (gameMatch) reasons.push("game match");
  if (externalIdMatch) reasons.push("external_id match");
  if (setIdMatch) reasons.push("set id match");
  if (setNameMatch) reasons.push("set name match");
  if (exactNameMatch) reasons.push("exact name");
  if (fuzzyNameMatch) reasons.push("similar name");
  if (exactNumberMatch) reasons.push("collector number match");
  if (baseNumberMatch) reasons.push("collector number base match");
  if (printedTotalMatch) reasons.push("printed total match");
  if (languageMatch) reasons.push("language match");
  if (rarityMatch) reasons.push("rarity match");
  if (cardTypeMatch) reasons.push("card type match");

  const clampedConfidence = Math.min(Math.max(confidence, 0.01), 0.99);

  return {
    score: Math.round(clampedConfidence * 1000) / 10,
    reasons: uniqueValues(reasons),
    confidence: Math.round(clampedConfidence * 1000) / 1000,
    confidenceReason,
    matchedFields,
    conflictingFields,
    scoreBreakdown,
  };
}

export function getLocalLookupNames(cardData) {
  return uniqueValues([cardData.englishNameGuess, cardData.card, cardData.name]);
}

export function getMatchTarget(cardData) {
  const { printedTotal } = parseCollectorNumber(cardData.collectorNumber || cardData.number);
  const numberLookupValues = getCollectorNumberLookupValues(cardData.collectorNumber || cardData.number);

  return {
    printedTotal: normalizePrintedTotal(cardData.printedTotal) || printedTotal || null,
    number: numberLookupValues.join(", ") || null,
    name: getLocalLookupNames(cardData).join(", ") || null,
    game: getGameKey(cardData.game) || normalizeValue(cardData.game) || null,
    setId: cardData.setId || cardData.set_id || cardData.setCode || null,
  };
}
