import {
  getCollectorNumberLookupValues,
  getGameKey,
  normalizeCardName,
  normalizeNumber,
  normalizeOnePieceCardId,
  normalizePrintedTotal,
  normalizeValue,
  parseCollectorNumber,
  uniqueValues,
} from "./normalizeCard.js";

export function buildMatchContext(cardData) {
  const gameKey = getGameKey(cardData.game);
  const rawCardNumber = cardData.cardNumber || cardData.collectorNumber || cardData.number;
  const parsedNumber = parseCollectorNumber(rawCardNumber);
  const printedTotal = normalizePrintedTotal(cardData.printedTotal) || parsedNumber.printedTotal;
  const externalId = cardData.externalId || cardData.external_id;
  const normalizedCollectorNumber = normalizeCollectorNumberForGame(rawCardNumber, gameKey);

  return {
    gameKey,
    scannedName: cardData.card || cardData.cardName || cardData.name || null,
    rawName: normalizeRawText(cardData.card || cardData.cardName || cardData.displayName || cardData.name),
    displayName: cardData.displayName || null,
    oracleName: cardData.oracleName || null,
    lookupNames: getLocalLookupNames(cardData),
    scannedCardId: cardData.cardID || cardData.cardId || cardData.cardNumber || cardData.collectorNumber || cardData.number || null,
    rawExtractedCardNumber: rawCardNumber || null,
    rawNumber: normalizeRawText(rawCardNumber),
    normalizedCollectorNumber,
    collectorNumberAliases: getCollectorNumberAliases(rawCardNumber, gameKey),
    externalId: normalizeValue(externalId),
    normalizedName: normalizeCardName(cardData.card || cardData.cardName || cardData.displayName),
    normalizedDisplayName: normalizeCardName(cardData.displayName),
    normalizedOracleName: normalizeCardName(cardData.oracleName),
    normalizedGame: normalizeValue(cardData.game),
    normalizedSetId: normalizeValue(cardData.setId || cardData.set_id),
    normalizedSetCode: normalizeValue(cardData.setCode),
    normalizedNumber: normalizedCollectorNumber,
    parsedNumber,
    printedTotal,
    language: normalizeValue(cardData.language),
    rarity: normalizeValue(cardData.rarity),
    rawRarity: normalizeRawText(cardData.rarity),
    onePieceCardId: normalizeOnePieceCardId(
      cardData.cardID || cardData.cardId || cardData.cardNumber || cardData.collectorNumber || cardData.number,
    ),
    cardType: normalizeValue(cardData.cardType),
    rawVariant: normalizeRawText(cardData.foilTreatment || cardData.editionType || cardData.variant),
    treatmentClues: getTreatmentClues(cardData),
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
  const gameKey = getGameKey(candidate.game);

  return {
    gameKey,
    candidateName: candidate.name || null,
    rawName: normalizeRawText(candidate.name),
    candidateNumber: candidate.number || null,
    rawNumber: normalizeRawText(candidate.number),
    normalizedCollectorNumber: normalizeCollectorNumberForGame(candidate.number, gameKey),
    collectorNumberAliases: getCollectorNumberAliases(candidate.number, gameKey),
    externalId: normalizeValue(externalId),
    normalizedName: normalizeCardName(candidate.name),
    normalizedGame: normalizeValue(candidate.game),
    normalizedSetId: normalizeValue(candidate.setId || candidate.set_id),
    normalizedSetCode: normalizeValue(candidate.setCode || (gameKey === "mtg" ? candidate.setId || candidate.set_id : null)),
    normalizedNumber: normalizeNumber(candidate.number),
    parsedNumber,
    printedTotal: normalizePrintedTotal(candidate.printedTotal) || parsedNumber.printedTotal,
    language: normalizeValue(candidate.language),
    rarity: normalizeValue(candidate.rarity),
    rawRarity: normalizeRawText(candidate.rarity),
    onePieceCardId: normalizeOnePieceCardId(
      candidate.externalId || candidate.cardID || candidate.cardId || candidate.id || candidate.number,
    ),
    cardType: normalizeValue(candidate.cardType),
    rawVariant: normalizeRawText(candidate.priceVariant || candidate.variant || candidate.foilTreatment || candidate.editionType),
    treatmentClues: getTreatmentClues(candidate),
  };
}

function normalizeRawText(value) {
  return String(value || "").trim();
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

function rawValuesMatch(left, right) {
  return hasValue(left) && hasValue(right) && left === right;
}

function getVerificationStatus({ hasScannedValue, hasCandidateValue, rawExact, normalizedExact, close, conflict }) {
  if (conflict) return "conflict";
  if (!hasScannedValue || !hasCandidateValue) return "missing";
  if (rawExact) return "raw_exact";
  if (normalizedExact) return "normalized_exact";
  if (close) return "close";
  return "review";
}

function normalizeCollectorNumberForGame(value, gameKey) {
  const raw = String(value || "")
    .trim()
    .replace(/^#\s*/, "");

  if (!raw) return "";

  if (gameKey === "pokemon") {
    return normalizeNumber(parseCollectorNumber(raw).number);
  }

  return raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]+/g, "");
}

function getCollectorNumberAliases(value, gameKey) {
  const normalized = normalizeCollectorNumberForGame(value, gameKey);
  const aliases = [normalized];
  const numericMatch = normalized.match(/^0+(\d+[a-z]?)$/i);

  if (numericMatch) {
    aliases.push(numericMatch[1]);
  }

  if (gameKey !== "pokemon") {
    const loose = normalizeNumber(value);
    if (loose) aliases.push(loose);
  }

  return uniqueValues(aliases);
}

function getBigrams(value) {
  const normalized = normalizeCardName(value).replace(/\s+/g, "");
  if (normalized.length <= 1) return normalized ? [normalized] : [];

  const bigrams = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2));
  }

  return bigrams;
}

function getSimilarity(left, right) {
  const normalizedLeft = normalizeCardName(left);
  const normalizedRight = normalizeCardName(right);

  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    const shorter = Math.min(normalizedLeft.length, normalizedRight.length);
    const longer = Math.max(normalizedLeft.length, normalizedRight.length);
    return Math.max(0.72, shorter / longer);
  }

  const leftBigrams = getBigrams(normalizedLeft);
  const rightBigrams = getBigrams(normalizedRight);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const rightCounts = new Map();
  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) || 0;
    if (count > 0) {
      intersection += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function getTreatmentClues(card) {
  const searchableText = [
    card.editionType,
    card.foilTreatment,
    card.priceVariant,
    card.variant,
    card.cardType,
    card.rarity,
    card.notes,
    card.name,
    card.set,
    card.setName,
    ...(Array.isArray(card.visibleText) ? card.visibleText : []),
  ].join(" ");
  const normalized = normalizeValue(searchableText);
  const clues = [];

  if (normalized.includes("pixel")) clues.push("pixel-art");
  if (normalized.includes("showcase")) clues.push("showcase");
  if (normalized.includes("retro")) clues.push("retro frame");
  if (normalized.includes("borderless")) clues.push("borderless");
  if (normalized.includes("extended art")) clues.push("extended art");
  if (normalized.includes("foil") || normalized.includes("etched")) clues.push("foil");

  return uniqueValues(clues);
}

export function scoreCandidate(matchContext, candidateMatchData) {
  const reasons = [];
  const matchedFields = [];
  const conflictingFields = [];
  const scoreBreakdown = [];
  const pokemonDebugReasons = [];

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
    matchContext.externalId && candidateMatchData.externalId && matchContext.externalId === candidateMatchData.externalId,
  );
  const cardIdMatch = Boolean(
    matchContext.onePieceCardId &&
      candidateMatchData.onePieceCardId &&
      matchContext.onePieceCardId === candidateMatchData.onePieceCardId
  );
  const setIdMatch = Boolean(
    matchContext.normalizedSetId &&
      candidateMatchData.normalizedSetId &&
      candidateMatchData.normalizedSetId === matchContext.normalizedSetId,
  );
  const setCodeMatch = Boolean(
    matchContext.normalizedSetCode &&
      candidateMatchData.normalizedSetCode &&
      candidateMatchData.normalizedSetCode === matchContext.normalizedSetCode
  );
  const rawExactNameMatch = rawValuesMatch(matchContext.rawName, candidateMatchData.rawName);
  const normalizedExactNameMatch = Boolean(
    matchContext.normalizedName &&
      candidateMatchData.normalizedName &&
      candidateMatchData.normalizedName === matchContext.normalizedName,
  );
  const exactNameMatch = rawExactNameMatch || normalizedExactNameMatch;
  const fuzzyNameMatch = Boolean(
    !exactNameMatch &&
      includesEither(candidateMatchData.normalizedName, matchContext.normalizedName)
  );
  const nameScore = getSimilarity(candidateMatchData.normalizedName, matchContext.normalizedName);
  const displayNameScore = getSimilarity(candidateMatchData.normalizedName, matchContext.normalizedDisplayName);
  const oracleNameScore = getSimilarity(candidateMatchData.normalizedName, matchContext.normalizedOracleName);
  const bestNameScore = Math.max(rawExactNameMatch ? 1 : 0, normalizedExactNameMatch ? 0.96 : 0, nameScore, displayNameScore, oracleNameScore);
  const alternateNameMatch = Boolean(
    matchContext.gameKey === "mtg" &&
      (displayNameScore >= 0.65 || oracleNameScore >= 0.65)
  );
  const collectorAliasMatch = matchContext.collectorNumberAliases.some((alias) =>
    candidateMatchData.collectorNumberAliases.includes(alias)
  );
  const rawExactNumberMatch = rawValuesMatch(matchContext.rawNumber, candidateMatchData.rawNumber);
  const exactNumberMatch = Boolean(
    matchContext.normalizedNumber &&
      candidateMatchData.normalizedNumber &&
      (rawExactNumberMatch || collectorAliasMatch),
  );
  const baseNumberMatch = Boolean(
    !exactNumberMatch &&
      matchContext.parsedNumber.normalizedNumber &&
      candidateMatchData.parsedNumber.normalizedNumber &&
      candidateMatchData.parsedNumber.normalizedNumber === matchContext.parsedNumber.normalizedNumber
  );
  const onePieceCardIdNumberMatch = Boolean(
    matchContext.gameKey === "onepiece" &&
      matchContext.onePieceCardId &&
      candidateMatchData.parsedNumber.normalizedNumber &&
      normalizeNumber(matchContext.onePieceCardId.match(/-(\d{3})$/)?.[1]) === candidateMatchData.parsedNumber.normalizedNumber
  );
  const numberMatch = exactNumberMatch || baseNumberMatch || onePieceCardIdNumberMatch;
  const setCodeScore = setCodeMatch ? 1 : 0;
  const numberScore = numberMatch ? 1 : 0;
  const printedTotalMatch = Boolean(
    matchContext.printedTotal &&
      candidateMatchData.printedTotal &&
      matchContext.printedTotal === candidateMatchData.printedTotal
  );
  const printedTotalScore = printedTotalMatch ? 1 : 0;
  const languageMatch = Boolean(matchContext.language && candidateMatchData.language && matchContext.language === candidateMatchData.language);
  const rawExactRarityMatch = rawValuesMatch(matchContext.rawRarity, candidateMatchData.rawRarity);
  const rarityMatch = Boolean(rawExactRarityMatch || (matchContext.rarity && candidateMatchData.rarity && matchContext.rarity === candidateMatchData.rarity));
  const rarityScore = rarityMatch ? 1 : 0;
  const cardTypeMatch = Boolean(matchContext.cardType && candidateMatchData.cardType && matchContext.cardType === candidateMatchData.cardType);
  const treatmentMatches = matchContext.treatmentClues.filter((clue) => candidateMatchData.treatmentClues.includes(clue));
  const treatmentMatch = treatmentMatches.length > 0;
  const externalIdSuffixMatch = Boolean(
    matchContext.gameKey === "onepiece" &&
      matchContext.onePieceCardId &&
      candidateMatchData.externalId &&
      candidateMatchData.externalId.includes(normalizeValue(matchContext.onePieceCardId))
  );
  const variantMatch = treatmentMatch || externalIdSuffixMatch || rawValuesMatch(matchContext.rawVariant, candidateMatchData.rawVariant);
  const nameConflict = Boolean(
    matchContext.normalizedName &&
      candidateMatchData.normalizedName &&
      !exactNameMatch &&
      !fuzzyNameMatch &&
      !alternateNameMatch
  );
  const setConflict = Boolean(
    valuesConflict(matchContext.normalizedSetCode, candidateMatchData.normalizedSetCode) &&
      !setCodeMatch
  );

  if (gameMatch) matchedFields.push("game");
  if (externalIdMatch) matchedFields.push("external_id");
  if (cardIdMatch) matchedFields.push("printed_card_id");
  if (setIdMatch) matchedFields.push("set_id");
  if (setCodeMatch) matchedFields.push("set_code");
  if (rawExactNameMatch) matchedFields.push("raw_name");
  if (!rawExactNameMatch && normalizedExactNameMatch) matchedFields.push("normalized_name");
  if (fuzzyNameMatch) matchedFields.push("similar_name");
  if (alternateNameMatch) matchedFields.push("alternate_name");
  if (exactNumberMatch) matchedFields.push("number");
  if (baseNumberMatch) matchedFields.push("number_base");
  if (onePieceCardIdNumberMatch) matchedFields.push("printed_card_id_number");
  if (printedTotalMatch) matchedFields.push("printed_total");
  if (languageMatch) matchedFields.push("language");
  if (rarityMatch) matchedFields.push("rarity");
  if (cardTypeMatch) matchedFields.push("card_type");
  if (treatmentMatch) matchedFields.push("treatment");
  if (externalIdSuffixMatch) matchedFields.push("external_id_suffix");

  if (matchContext.gameKey === "pokemon") {
    if (exactNameMatch) pokemonDebugReasons.push("pokemon name match");
    if (nameConflict) pokemonDebugReasons.push("pokemon name conflict");
    if (numberMatch) pokemonDebugReasons.push("pokemon collector number match");
    if (printedTotalMatch) pokemonDebugReasons.push("pokemon printed total match");
    if (valuesConflict(matchContext.printedTotal, candidateMatchData.printedTotal)) {
      pokemonDebugReasons.push("pokemon printed total conflict");
    }
    if (setIdMatch) pokemonDebugReasons.push("pokemon trusted set id match");
  }

  if (!gameMatch && valuesConflict(matchContext.normalizedGame, candidateMatchData.normalizedGame)) conflictingFields.push("game");
  if (valuesConflict(matchContext.externalId, candidateMatchData.externalId)) conflictingFields.push("external_id");
  if (valuesConflict(matchContext.onePieceCardId, candidateMatchData.onePieceCardId)) conflictingFields.push("one_piece_card_id");
  if (setConflict) conflictingFields.push("set");
  if (nameConflict) conflictingFields.push("name");
  if (!numberMatch && valuesConflict(matchContext.normalizedNumber, candidateMatchData.normalizedNumber)) conflictingFields.push("number");
  if (valuesConflict(matchContext.printedTotal, candidateMatchData.printedTotal)) conflictingFields.push("printed_total");
  if (valuesConflict(matchContext.language, candidateMatchData.language)) conflictingFields.push("language");
  if (valuesConflict(matchContext.rarity, candidateMatchData.rarity)) conflictingFields.push("rarity");

  let confidence = 0.2;
  let confidenceReason = "weak text match";
  let rejectionReason = null;
  const weightedScore = (() => {
    if (matchContext.gameKey === "pokemon") {
      return (bestNameScore * 0.7) + (numberScore * 0.25) + (printedTotalScore * 0.05);
    }

    if (matchContext.gameKey === "mtg") {
      if (setCodeScore === 1 && numberScore === 1) {
        return Math.min(0.99, 0.9 + (bestNameScore * 0.07) + (rarityScore * 0.02));
      }

      if (bestNameScore >= 0.95 && numberScore === 1) {
        return Math.min(0.99, 0.95 + (rarityScore * 0.03));
      }

      return (bestNameScore * 0.7) + (numberScore * 0.22) + (setCodeScore * 0.06) + (rarityScore * 0.02);
    }

    if (matchContext.gameKey === "onepiece") {
      return (bestNameScore * 0.55) + (numberScore * 0.4) + (rarityScore * 0.05) + (externalIdSuffixMatch ? 0.05 : 0);
    }

    return (bestNameScore * 0.6) + (numberScore * 0.25) + (setCodeScore * 0.15);
  })();

  if (externalIdMatch) {
    confidence = 0.97;
    confidenceReason = "exact external_id match";
  } else if (matchContext.gameKey === "pokemon") {
    confidence = weightedScore;
    confidenceReason = "pokemon weighted visible-field match";
  } else if (matchContext.gameKey === "mtg") {
    confidence = weightedScore;
    confidenceReason = setCodeScore === 1 && numberScore === 1
      ? "mtg set code + card number match"
      : "mtg weighted visible-field match";
  } else if (matchContext.gameKey === "onepiece") {
    confidence = weightedScore;
    confidenceReason = "onepiece weighted visible-field match";
  } else if (matchContext.gameKey === "mtg" && gameMatch && exactNameMatch) {
    confidence = 0.86;
    confidenceReason = "mtg exact name match";
  } else if (gameMatch && setIdMatch && numberMatch && exactNameMatch) {
    confidence = 0.95;
    confidenceReason = "exact game + name + set_id + number match";
  } else if (gameMatch && numberMatch && exactNameMatch) {
    confidence = 0.90;
    confidenceReason = "exact game + number + name match";
  } else if (gameMatch && setIdMatch && numberMatch) {
    confidence = 0.94;
    confidenceReason = "exact game + set_id + number match";
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

  const baseScore = confidence;
  const capsApplied = [];

  scoreBreakdown.push({ reason: confidenceReason, delta: confidence });

  const adjustments = [
    [languageMatch, 0.03, "language match"],
    [rarityMatch, 0.02, "rarity match"],
    [printedTotalMatch && !numberMatch, 0.02, "printed total match"],
    [cardTypeMatch, 0.02, "card type match"],
    [treatmentMatch, 0.02, "treatment match"],
    [rawExactNameMatch, 0.02, "raw exact name match"],
    [externalIdSuffixMatch, 0.04, "onepiece external_id suffix match"],
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
    if (matchContext.gameKey === "pokemon" && field === "printed_total" && exactNameMatch && numberMatch) {
      reasons.push("printed total conflict");
      scoreBreakdown.push({ reason: "printed_total conflict ignored for pokemon name + number match", delta: 0 });
      continue;
    }

    if (matchContext.gameKey === "onepiece" && field === "set" && cardIdMatch) {
      reasons.push("set conflict");
      scoreBreakdown.push({ reason: "set conflict ignored for onepiece printed card id match", delta: 0 });
      continue;
    }

    const delta = conflictPenalties[field] ?? -0.1;
    confidence += delta;
    reasons.push(`${field.replaceAll("_", " ")} conflict`);
    scoreBreakdown.push({ reason: `${field} conflict`, delta });
  }

  function applyCap(label, cap) {
    if (confidence <= cap) return;

    capsApplied.push({ reason: label, maxConfidence: cap });
    scoreBreakdown.push({ reason: label, delta: cap - confidence });
    confidence = cap;
  }

  if (numberMatch && !exactNameMatch && !fuzzyNameMatch && setCodeScore === 0 && !externalIdMatch && !cardIdMatch) {
    rejectionReason = "collector number matched without card name or set support";
    applyCap("collector number only cap", 0.1);
  }

  if (
    matchContext.normalizedName &&
    candidateMatchData.normalizedName &&
    bestNameScore < 0.65 &&
    !(matchContext.gameKey === "mtg" && setCodeScore === 1 && numberScore === 1)
  ) {
    rejectionReason = numberMatch
      ? "collector number matched but card name is clearly different"
      : "card name similarity below 0.65";
    applyCap("card name similarity below 0.65 cap", 0.4);
  }

  if (confidence > 0.99 && !(bestNameScore >= 0.9 && (setCodeScore === 1 || numberScore === 1 || cardIdMatch || externalIdMatch))) {
    rejectionReason = "100% score requires near-exact card name plus another strong field";
    applyCap("no perfect score without name plus strong field cap", 0.99);
  }

  if (nameConflict) applyCap("name conflict cap", 0.2);
  if (setConflict && !(matchContext.gameKey === "onepiece" && cardIdMatch)) applyCap("set conflict cap", 0.25);
  if (conflictingFields.includes("number")) applyCap("number conflict cap", 0.25);
  if (conflictingFields.includes("printed_total") && !(matchContext.gameKey === "pokemon" && exactNameMatch && numberMatch)) {
    applyCap("printed total conflict cap", 0.5);
  }

  if (gameMatch) reasons.push("game match");
  if (externalIdMatch) reasons.push("external_id match");
  if (cardIdMatch) reasons.push("printed card id match");
  if (setIdMatch) reasons.push("set id match");
  if (setCodeMatch) reasons.push("set code match");
  if (rawExactNameMatch) reasons.push("raw exact name");
  if (!rawExactNameMatch && normalizedExactNameMatch) reasons.push("normalized exact name");
  if (fuzzyNameMatch) reasons.push("similar name");
  if (alternateNameMatch) reasons.push("alternate name");
  if (exactNumberMatch) reasons.push("collector number match");
  if (baseNumberMatch) reasons.push("collector number base match");
  if (onePieceCardIdNumberMatch) reasons.push("printed card id number match");
  if (printedTotalMatch) reasons.push("printed total match");
  if (languageMatch) reasons.push("language match");
  if (rarityMatch) reasons.push("rarity match");
  if (cardTypeMatch) reasons.push("card type match");
  if (treatmentMatch) reasons.push("treatment match");
  if (externalIdSuffixMatch) reasons.push("external_id suffix match");

  const clampedConfidence = Math.min(Math.max(confidence, 0.01), 0.99);
  const fieldVerification = {
    name: {
      label: rawExactNameMatch ? "Exact" : normalizedExactNameMatch ? "Normalized exact" : fuzzyNameMatch || alternateNameMatch ? "Close" : nameConflict ? "Conflict" : "Review",
      status: getVerificationStatus({
        hasScannedValue: Boolean(matchContext.rawName || matchContext.normalizedName),
        hasCandidateValue: Boolean(candidateMatchData.rawName || candidateMatchData.normalizedName),
        rawExact: rawExactNameMatch,
        normalizedExact: normalizedExactNameMatch,
        close: fuzzyNameMatch || alternateNameMatch || bestNameScore >= 0.75,
        conflict: nameConflict,
      }),
    },
    number: {
      label: numberMatch ? "Exact" : conflictingFields.includes("number") ? "Conflict" : "Review",
      status: getVerificationStatus({
        hasScannedValue: Boolean(matchContext.rawNumber || matchContext.normalizedNumber || matchContext.onePieceCardId),
        hasCandidateValue: Boolean(candidateMatchData.rawNumber || candidateMatchData.normalizedNumber),
        rawExact: rawExactNumberMatch,
        normalizedExact: numberMatch,
        close: false,
        conflict: conflictingFields.includes("number"),
      }),
    },
    rarity: {
      label: rarityMatch ? "Exact" : conflictingFields.includes("rarity") ? "Conflict" : (!matchContext.rarity || !candidateMatchData.rarity) ? "Missing" : "Review",
      status: getVerificationStatus({
        hasScannedValue: Boolean(matchContext.rarity),
        hasCandidateValue: Boolean(candidateMatchData.rarity),
        rawExact: rawExactRarityMatch,
        normalizedExact: rarityMatch,
        close: false,
        conflict: conflictingFields.includes("rarity"),
      }),
    },
    variant: {
      label: variantMatch ? "Exact" : (!matchContext.rawVariant && matchContext.treatmentClues.length === 0 && !matchContext.onePieceCardId) ? "Missing" : "Review",
      status: variantMatch ? "raw_exact" : (!matchContext.rawVariant && matchContext.treatmentClues.length === 0 && !matchContext.onePieceCardId) ? "missing" : "review",
    },
  };
  const identityDebug = {
    game: matchContext.gameKey,
    scannedName: matchContext.scannedName,
    displayName: matchContext.displayName,
    oracleName: matchContext.oracleName,
    chosenCardName: matchContext.scannedName,
    lookupNames: matchContext.lookupNames,
    candidateName: candidateMatchData.candidateName,
    scannedCardId: matchContext.scannedCardId,
    rawExtractedCardNumber: matchContext.rawExtractedCardNumber,
    normalizedExtractedCollectorNumber: matchContext.normalizedCollectorNumber,
    candidateNumber: candidateMatchData.candidateNumber,
    candidateCollectorNumber: candidateMatchData.candidateNumber,
    printedTotal: matchContext.printedTotal,
    setCode: matchContext.normalizedSetCode || null,
    rarity: matchContext.rarity || null,
    nameMatch: exactNameMatch || fuzzyNameMatch,
    rawExactNameMatch,
    normalizedExactNameMatch,
    numberMatch,
    cardIdMatch,
    trustedSetMatch: setIdMatch,
    conflicts: conflictingFields,
    capsApplied,
    baseScore: Math.round(baseScore * 1000) / 1000,
    finalScore: Math.round(clampedConfidence * 1000) / 10,
    nameScore: Math.round(nameScore * 1000) / 1000,
    displayNameScore: Math.round(displayNameScore * 1000) / 1000,
    oracleNameScore: Math.round(oracleNameScore * 1000) / 1000,
    bestNameScore: Math.round(bestNameScore * 1000) / 1000,
    setCodeScore: Math.round(setCodeScore * 1000) / 1000,
    numberScore: Math.round(numberScore * 1000) / 1000,
    printedTotalScore: Math.round(printedTotalScore * 1000) / 1000,
    rarityScore: Math.round(rarityScore * 1000) / 1000,
    weightedScore: Math.round(weightedScore * 1000) / 1000,
    fieldVerification,
    rejectionReason,
  };

  return {
    score: Math.round(clampedConfidence * 1000) / 10,
    reasons: uniqueValues(reasons),
    confidence: Math.round(clampedConfidence * 1000) / 1000,
    confidenceReason,
    matchedFields,
    conflictingFields,
    baseScore: Math.round(baseScore * 1000) / 1000,
    capsApplied,
    finalScore: Math.round(clampedConfidence * 1000) / 10,
    pokemonDebugReasons,
    scoreBreakdown,
    fieldVerification,
    identityDebug,
  };
}

export function getLocalLookupNames(cardData) {
  if (getGameKey(cardData.game) === "mtg") {
    return uniqueValues([
      cardData.displayName,
      cardData.cardName,
      cardData.card,
      cardData.name,
      cardData.oracleName,
      cardData.englishNameGuess,
    ]);
  }

  return uniqueValues([cardData.englishNameGuess, cardData.cardName, cardData.card, cardData.name]);
}

export function getMatchTarget(cardData) {
  const { printedTotal } = parseCollectorNumber(cardData.cardNumber || cardData.collectorNumber || cardData.number);
  const numberLookupValues = getCollectorNumberLookupValues(cardData.cardNumber || cardData.collectorNumber || cardData.number);

  return {
    printedTotal: normalizePrintedTotal(cardData.printedTotal) || printedTotal || null,
    number: numberLookupValues.join(", ") || null,
    name: getLocalLookupNames(cardData).join(", ") || null,
    game: getGameKey(cardData.game) || normalizeValue(cardData.game) || null,
    setId: cardData.setId || cardData.set_id || null,
  };
}
