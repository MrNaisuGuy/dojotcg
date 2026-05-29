import { estimateRegionalPrices } from "./pricingService.js";
import { endTimer, isAnalyzeDebugEnabled, startTimer } from "../utils/analyzeDebug.js";
import {
  buildCandidateMatchData,
  buildMatchContext,
  getLocalLookupNames,
  getMatchTarget,
  scoreCandidate,
} from "../utils/cardScoring.js";
import {
  getCollectorNumberLookupValues,
  getGameKey,
  normalizeNumber,
  normalizeCardName,
  normalizeOnePieceCardId,
  normalizePrintedTotal,
  parseCollectorNumber,
  uniqueValues,
} from "../utils/normalizeCard.js";

const FALLBACK_CARD_IMAGE = "/images/dojobird.png";
const CARD_SELECT_FIELDS = [
  "id",
  "external_id",
  "game",
  "name",
  "set_name",
  "set_id",
  "number",
  "printed_total",
  "rarity",
  "image_url",
  "price_usd",
  "price_variant",
  "price_updated_at",
].join(",");
const RPC_FALLBACK_ERROR_CODES = new Set(["42703", "42883", "PGRST202"]);
const LOOKUP_STAGE_STRENGTH = {
  "exact external_id": 5,
  "exact game + set_id + number": 4,
  "exact game + number": 3,
  "exact name": 2,
  "number prefix fallback": 1,
  "fuzzy name fallback": 0,
};

function createSupabaseCardQuery(supabase) {
  return supabase
    .from("cards")
    .select(CARD_SELECT_FIELDS);
}

function applyKnownGameFilter(query, gameKey) {
  return gameKey && gameKey !== "unknown" ? query.eq("game", gameKey) : query;
}

function normalizeDedupePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCandidateDedupeKeys(candidate) {
  const game = normalizeDedupePart(candidate.game);
  const setId = normalizeDedupePart(candidate.setId);
  const number = normalizeNumber(candidate.number);
  const language = normalizeDedupePart(candidate.language || "unknown");
  const name = normalizeDedupePart(candidate.name);

  return [
    candidate.id ? `id:${candidate.id}` : null,
    candidate.externalId ? `external_id:${normalizeDedupePart(candidate.externalId)}` : null,
    game && setId && number ? `game_set_number_language:${game}:${setId}:${number}:${language}` : null,
    game && name && setId && number ? `game_name_set_number:${game}:${name}:${setId}:${number}` : null,
  ].filter(Boolean);
}

function getRawCardDedupeKeys(card) {
  const game = normalizeDedupePart(card.game);
  const setId = normalizeDedupePart(card.set_id);
  const number = normalizeNumber(card.number);
  const language = normalizeDedupePart(card.language || "unknown");
  const name = normalizeDedupePart(card.name);

  return [
    card.id ? `id:${card.id}` : null,
    card.external_id ? `external_id:${normalizeDedupePart(card.external_id)}` : null,
    game && setId && number ? `game_set_number_language:${game}:${setId}:${number}:${language}` : null,
    game && name && setId && number ? `game_name_set_number:${game}:${name}:${setId}:${number}` : null,
  ].filter(Boolean);
}

function getPrimaryDedupeKey(candidate) {
  return getCandidateDedupeKeys(candidate)[0] || `fallback:${normalizeDedupePart(candidate.game)}:${normalizeDedupePart(candidate.name)}:${normalizeNumber(candidate.number)}`;
}

function getLookupStageStrength(stage) {
  return LOOKUP_STAGE_STRENGTH[stage] ?? -1;
}

function mergeDuplicateCandidate(existing, candidate) {
  const existingStages = existing.lookupStages || [existing.lookupStage].filter(Boolean);
  const candidateStages = candidate.lookupStages || [candidate.lookupStage].filter(Boolean);
  const lookupStages = uniqueValues([...existingStages, ...candidateStages]);
  const strongestStage = lookupStages
    .slice()
    .sort((a, b) => getLookupStageStrength(b) - getLookupStageStrength(a))[0];
  const strongestCandidate = getLookupStageStrength(candidate.lookupStage) > getLookupStageStrength(existing.lookupStage)
    ? candidate
    : existing;

  return {
    ...strongestCandidate,
    matchScore: Math.max(existing.matchScore || 0, candidate.matchScore || 0),
    matchReasons: uniqueValues([...(existing.matchReasons || []), ...(candidate.matchReasons || [])]),
    lookupStage: strongestStage,
    lookupStages,
    ...(isAnalyzeDebugEnabled()
      ? {
          matchDebug: {
            ...(strongestCandidate.matchDebug || {}),
            dedupeKeys: uniqueValues([
              ...(existing.matchDebug?.dedupeKeys || []),
              ...(candidate.matchDebug?.dedupeKeys || []),
            ]),
            lookupStages,
          },
        }
      : {}),
  };
}

export function dedupeCandidateMatches(candidates) {
  const deduped = [];
  const keyToIndex = new Map();
  const debug = {
    beforeCount: candidates.length,
    afterCount: 0,
    keysUsed: [],
    stagesByKey: {},
  };

  for (const candidate of candidates) {
    const keys = getCandidateDedupeKeys(candidate);
    const primaryKey = keys[0] || getPrimaryDedupeKey(candidate);
    const existingIndex = keys
      .map((key) => keyToIndex.get(key))
      .find((index) => index !== undefined);

    debug.keysUsed.push(primaryKey);
    debug.stagesByKey[primaryKey] = uniqueValues([
      ...(debug.stagesByKey[primaryKey] || []),
      candidate.lookupStage,
      ...(candidate.lookupStages || []),
    ].filter(Boolean));

    if (existingIndex === undefined) {
      keyToIndex.set(primaryKey, deduped.length);
      for (const key of keys) keyToIndex.set(key, deduped.length);
      deduped.push(candidate);
      continue;
    }

    deduped[existingIndex] = mergeDuplicateCandidate(deduped[existingIndex], candidate);
    for (const key of keys) keyToIndex.set(key, existingIndex);
  }

  debug.afterCount = deduped.length;

  return {
    candidates: deduped,
    debug,
  };
}

function dedupeRawCards(cards, lookupStage) {
  const deduped = [];
  const keyToIndex = new Map();
  const debug = {
    beforeCount: cards.length,
    afterCount: 0,
    keysUsed: [],
    stagesByKey: {},
  };

  for (const card of cards) {
    const keys = getRawCardDedupeKeys(card);
    const primaryKey = keys[0] || `fallback:${normalizeDedupePart(card.game)}:${normalizeDedupePart(card.name)}:${normalizeNumber(card.number)}`;
    const existingIndex = keys
      .map((key) => keyToIndex.get(key))
      .find((index) => index !== undefined);

    debug.keysUsed.push(primaryKey);
    debug.stagesByKey[primaryKey] = uniqueValues([
      ...(debug.stagesByKey[primaryKey] || []),
      lookupStage,
    ].filter(Boolean));

    if (existingIndex !== undefined) continue;

    keyToIndex.set(primaryKey, deduped.length);
    for (const key of keys) keyToIndex.set(key, deduped.length);
    deduped.push(card);
  }

  debug.afterCount = deduped.length;

  return {
    cards: deduped,
    debug,
  };
}

function hasReason(candidate, pattern) {
  return candidate.matchReasons?.some((reason) => pattern.test(reason));
}

function isStrongIdentityMatch(candidate) {
  return candidate.matchScore >= 85 && (
    hasReason(candidate, /external_id match/i) ||
    hasReason(candidate, /printed card id match/i) ||
    (hasReason(candidate, /exact name/i) && hasReason(candidate, /collector number/i)) ||
    (hasReason(candidate, /set (?:id |name )?match/i) && hasReason(candidate, /collector number/i))
  );
}

function isCollectorNumberOnlyDistractor(candidate) {
  const hasNumber = hasReason(candidate, /collector number/i);
  const hasName = hasReason(candidate, /exact name|similar name/i);
  const hasSet = hasReason(candidate, /set (?:id |name )?match/i);
  const hasExternalId = hasReason(candidate, /external_id match/i);
  const hasPrintedCardId = hasReason(candidate, /printed card id match/i);

  return hasNumber && !hasName && !hasSet && !hasExternalId && !hasPrintedCardId;
}

function isLowScoreNameConflict(candidate) {
  return candidate.matchScore <= 20 && hasReason(candidate, /name conflict/i);
}

export function pruneWeakDistractors(candidates) {
  const hasStrongIdentityMatch = candidates.some(isStrongIdentityMatch);

  if (!hasStrongIdentityMatch) return candidates;

  return candidates.filter((candidate) => (
    !isCollectorNumberOnlyDistractor(candidate) &&
    !isLowScoreNameConflict(candidate)
  ));
}

function formatSupabaseCardMatch(card, cardData, matchContext, lookupStage) {
  const parsedPrice = typeof card.price_usd === "string" ? Number(card.price_usd) : card.price_usd;
  const lowestPrice = typeof parsedPrice === "number" && Number.isFinite(parsedPrice) ? parsedPrice : null;
  const candidate = {
    id: card.id,
    externalId: card.external_id,
    name: card.name,
    game: card.game,
    set: card.set_name,
    setId: card.set_id,
    number: card.number,
    cardType: null,
    language: card.language,
    collectorNumber: cardData.collectorNumber,
    printedTotal: card.printed_total,
    rarity: card.rarity,
    tcgplayerId: null,
    lowestPrice,
    regionalPrices: {
      us: lowestPrice,
      jp: null,
      kr: null,
      basePrice: lowestPrice,
      characterModifier: 1,
    },
    priceVariant: card.price_variant,
    priceUpdatedAt: card.price_updated_at,
    imageUrl: card.image_url || FALLBACK_CARD_IMAGE,
    imageSource: card.image_url ? "Supabase card catalog" : "DojoTCG fallback",
    dataSource: "Supabase card catalog",
  };
  const candidateMatchData = buildCandidateMatchData(candidate);

  startTimer("analyze:pricing");
  const regionalPrices = estimateRegionalPrices(candidate);
  endTimer("analyze:pricing");

  startTimer("analyze:candidate_scoring");
  const match = scoreCandidate(matchContext, candidateMatchData);
  endTimer("analyze:candidate_scoring");
  const dedupeKeys = getCandidateDedupeKeys(candidate);

  if (isAnalyzeDebugEnabled()) {
    console.info("analyze:candidate_score", {
      candidateName: candidate.name,
      candidateSet: candidate.set,
      candidateCollectorNumber: candidate.number,
      game: match.identityDebug?.game,
      extractedCardName: match.identityDebug?.scannedName,
      displayName: match.identityDebug?.displayName,
      oracleName: match.identityDebug?.oracleName,
      chosenCardName: match.identityDebug?.chosenCardName,
      lookupNames: match.identityDebug?.lookupNames,
      lookupPathUsed: lookupStage,
      rawExtractedCardNumber: match.identityDebug?.rawExtractedCardNumber,
      normalizedExtractedCollectorNumber: match.identityDebug?.normalizedExtractedCollectorNumber,
      cardNumber: match.identityDebug?.scannedCardId,
      printed_total: match.identityDebug?.printedTotal,
      candidateCollectorNumber: match.identityDebug?.candidateCollectorNumber,
      setCode: match.identityDebug?.setCode,
      rarity: match.identityDebug?.rarity,
      nameScore: match.identityDebug?.nameScore,
      displayNameScore: match.identityDebug?.displayNameScore,
      oracleNameScore: match.identityDebug?.oracleNameScore,
      bestNameScore: match.identityDebug?.bestNameScore,
      numberScore: match.identityDebug?.numberScore,
      printedTotalScore: match.identityDebug?.printedTotalScore,
      setCodeScore: match.identityDebug?.setCodeScore,
      rarityScore: match.identityDebug?.rarityScore,
      finalScore: match.finalScore,
      rejectionOrCapReason: match.identityDebug?.rejectionReason || match.capsApplied?.map((cap) => cap.reason).join(", ") || null,
    });
  }

  return {
    ...candidate,
    regionalPrices,
    matchScore: match.finalScore,
    fieldVerification: match.fieldVerification,
    matchReasons: match.reasons,
    ...(isAnalyzeDebugEnabled()
      ? {
          scoreDebug: {
            ...match.identityDebug,
            name: candidate.name,
            number: candidate.number,
            matchScore: match.finalScore,
            baseScore: match.baseScore,
            finalScore: match.finalScore,
            capsApplied: match.capsApplied,
            conflictingFields: match.conflictingFields,
            matchReasons: match.reasons,
            identityDebug: match.identityDebug,
          },
        }
      : {}),
    lookupStage,
    lookupStages: [lookupStage].filter(Boolean),
    ...(isAnalyzeDebugEnabled()
      ? {
          matchDebug: {
            ...match.identityDebug,
            confidence: match.confidence,
            confidenceReason: match.confidenceReason,
            baseScore: match.baseScore,
            capsApplied: match.capsApplied,
            finalScore: match.finalScore,
            matchedFields: match.matchedFields,
            conflictingFields: match.conflictingFields,
            pokemonDebugReasons: match.pokemonDebugReasons,
            scoreBreakdown: match.scoreBreakdown,
            identityDebug: match.identityDebug,
            dedupeKeys,
            lookupStages: [lookupStage].filter(Boolean),
          },
        }
      : {}),
  };
}

function getSetIdLookupValues(cardData, onePieceCardId, gameKey) {
  const onePieceSetId = onePieceCardId?.match(/^([A-Z]+[0-9]{2})-/)?.[1];
  const values = [
    cardData.setId,
    cardData.set_id,
    gameKey === "mtg" ? cardData.setCode : null,
    gameKey === "onepiece" ? onePieceSetId : null,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .flatMap((value) => [value, value.toUpperCase(), value.toLowerCase()]);

  return uniqueValues(values);
}

function getNumberLookupValues(cardData, onePieceCardId) {
  const onePieceNumber = onePieceCardId?.match(/-(\d{3})$/)?.[1];

  return uniqueValues([
    ...getCollectorNumberLookupValues(cardData.cardNumber || cardData.collectorNumber || cardData.number),
    onePieceNumber,
    onePieceNumber ? normalizeNumber(onePieceNumber) : null,
  ]);
}

function getExternalIdLookupValues(cardData, onePieceCardId) {
  return uniqueValues([
    cardData.externalId,
    cardData.external_id,
    cardData.cardID,
    cardData.cardId,
    onePieceCardId,
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function getNameLookupValues(cardData) {
  const exactNames = getLocalLookupNames(cardData)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const normalizedNames = exactNames
    .map((value) => normalizeCardName(value))
    .filter(Boolean);

  return uniqueValues([...exactNames, ...normalizedNames]);
}

function getExactNameLookupValues(names) {
  return uniqueValues(names
    .map((name) => String(name || "").trim())
    .filter(Boolean));
}

function getFuzzyNamePatterns(names) {
  return uniqueValues(names.flatMap((name) => {
    const normalizedName = String(name || "").trim().replace(/[,()]/g, " ").replace(/\s+/g, " ");
    const normalizedCardName = normalizeCardName(name);

    return uniqueValues([
      normalizedName,
      normalizedCardName,
      normalizedName ? `${normalizedName}%` : null,
      normalizedName ? `%${normalizedName}%` : null,
      normalizedCardName ? `${normalizedCardName}%` : null,
      normalizedCardName ? `%${normalizedCardName}%` : null,
    ]);
  }));
}

async function findExactNameMatches({ supabase, gameKey, names, cardData, matchContext }) {
  const exactNames = getExactNameLookupValues(names);

  if (exactNames.length === 0) return { candidates: [], usedFallback: false };

  try {
    const { data, error } = await supabase.rpc("lookup_cards_by_lower_name", {
      p_game: gameKey,
      p_names: exactNames,
      p_limit: 8,
    });

    if (error) throw error;

    const formatted = formatMatches(data || [], cardData, matchContext, 3, "exact name");

    return {
      candidates: formatted.candidates,
      dedupeDebug: formatted.dedupeDebug,
      searchQuery: `exact name game=${gameKey} | name ilike any (${exactNames.join(", ")})`,
      usedFallback: false,
    };
  } catch (error) {
    if (!RPC_FALLBACK_ERROR_CODES.has(error.code)) {
      throw error;
    }

    // Keep a compatibility fallback for environments where the SQL helper has
    // not been deployed yet.
    const data = [];

    for (const exactName of exactNames) {
      const exactNameQuery = applyKnownGameFilter(createSupabaseCardQuery(supabase), gameKey)
        .ilike("name", exactName)
        .limit(8);

      const { data: exactNameData, error: exactNameError } = await exactNameQuery;

      if (exactNameError) throw exactNameError;
      data.push(...(exactNameData || []));
      if (data.length >= 8) break;
    }

    const formatted = formatMatches(data || [], cardData, matchContext, 3, "exact name");

    return {
      candidates: formatted.candidates,
      dedupeDebug: formatted.dedupeDebug,
      searchQuery: `exact name game=${gameKey} | name ilike (${exactNames.join(", ")})`,
      usedFallback: true,
    };
  }
}

async function runCandidateQuery({ supabase, gameKey, limit = 10, describe, apply }) {
  let query = createSupabaseCardQuery(supabase).limit(limit);

  query = applyKnownGameFilter(query, gameKey);
  query = apply(query);

  const { data, error } = await query;

  if (error) throw error;

  return {
    data: data || [],
    describe,
  };
}

function formatMatches(data, cardData, matchContext, limit, lookupStage) {
  const rawDedupe = dedupeRawCards(data, lookupStage);
  const matches = rawDedupe.cards
    .map((card) => formatSupabaseCardMatch(card, cardData, matchContext, lookupStage))
    .sort((a, b) => b.matchScore - a.matchScore)
  const deduped = dedupeCandidateMatches(matches);
  const prunedCandidates = pruneWeakDistractors(deduped.candidates)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return {
    candidates: prunedCandidates,
    dedupeDebug: {
      beforeCount: rawDedupe.debug.beforeCount,
      afterCount: prunedCandidates.length,
      keysUsed: uniqueValues([...rawDedupe.debug.keysUsed, ...deduped.debug.keysUsed]),
      stagesByKey: {
        ...rawDedupe.debug.stagesByKey,
        ...deduped.debug.stagesByKey,
      },
      prunedCount: deduped.candidates.length - prunedCandidates.length,
    },
  };
}

export async function findLocalCandidates(cardData, supabase) {
  startTimer("analyze:supabase_lookup");
  const matchTarget = getMatchTarget(cardData);
  const matchContext = buildMatchContext(cardData);
  const gameKey = getGameKey(cardData.game);
  const { printedTotal } = parseCollectorNumber(cardData.cardNumber || cardData.collectorNumber || cardData.number);
  const onePieceCardId = gameKey === "onepiece"
    ? normalizeOnePieceCardId(cardData.cardID || cardData.cardId || cardData.cardNumber || cardData.collectorNumber || cardData.number)
    : null;
  const numberLookupValues = getNumberLookupValues(cardData, onePieceCardId);
  const externalIdLookupValues = getExternalIdLookupValues(cardData, onePieceCardId);
  const setIdLookupValues = getSetIdLookupValues(cardData, onePieceCardId, gameKey);
  const targetPrintedTotal = normalizePrintedTotal(cardData.printedTotal) || printedTotal;
  const names = getNameLookupValues(cardData);
  let exactNameAttempted = false;

  if (!supabase) {
    endTimer("analyze:supabase_lookup");
    return {
      candidates: [],
      searchQuery: null,
      matchTarget,
    };
  }

  if (gameKey === "mtg" && setIdLookupValues.length > 0 && numberLookupValues.length > 0) {
    startTimer("analyze:supabase_exact_lookup");
    const { data, describe } = await runCandidateQuery({
      supabase,
      gameKey,
      limit: 10,
      describe: `game=${gameKey} | set_id in (${setIdLookupValues.join(", ")}) | number in (${numberLookupValues.join(", ")})`,
      apply: (query) => query
        .in("set_id", setIdLookupValues)
        .in("number", numberLookupValues),
    });
    const formatted = formatMatches(data, cardData, matchContext, 5, "exact game + set_id + number");
    endTimer("analyze:supabase_exact_lookup");

    if (formatted.candidates.length > 0) {
      endTimer("analyze:supabase_lookup");
      return {
        candidates: formatted.candidates,
        searchQuery: describe,
        matchTarget,
        dedupeDebug: formatted.dedupeDebug,
      };
    }
  }

  if (names.length > 0 && gameKey !== "unknown") {
    exactNameAttempted = true;
    startTimer("analyze:supabase_exact_lookup");
    const exactNameResult = await findExactNameMatches({
      supabase,
      gameKey,
      names,
      cardData,
      matchContext,
    });
    endTimer("analyze:supabase_exact_lookup");

    if (exactNameResult.candidates.length > 0) {
      endTimer("analyze:supabase_lookup");
      return {
        candidates: exactNameResult.candidates,
        searchQuery: exactNameResult.searchQuery,
        matchTarget,
        dedupeDebug: exactNameResult.dedupeDebug,
      };
    }
  }

  const stagedQueries = [];

  // Fast path: simple equality predicates that match composite btree indexes.
  if (names.length === 0 && gameKey !== "unknown" && setIdLookupValues.length > 0 && numberLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact game + set_id + number",
      describe: `game=${gameKey} | set_id in (${setIdLookupValues.join(", ")}) | number in (${numberLookupValues.join(", ")})`,
      limit: 10,
      apply: (query) => query
        .in("set_id", setIdLookupValues)
        .in("number", numberLookupValues),
    });
  }

  if (names.length === 0 && gameKey !== "unknown" && numberLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact game + number",
      describe: `game=${gameKey} | number in (${numberLookupValues.join(", ")})`,
      limit: 20,
      apply: (query) => query.in("number", numberLookupValues),
    });
  }

  if (names.length === 0 && gameKey !== "unknown" && externalIdLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact external_id",
      describe: `game=${gameKey} | external_id in (${externalIdLookupValues.join(", ")})`,
      limit: 10,
      apply: (query) => query.in("external_id", externalIdLookupValues),
    });
  }

  startTimer("analyze:supabase_exact_lookup");
  for (const stagedQuery of stagedQueries) {
    const { data, describe } = await runCandidateQuery({
      supabase,
      gameKey,
      limit: stagedQuery.limit,
      describe: stagedQuery.describe,
      apply: stagedQuery.apply,
    });
    const formatted = formatMatches(data, cardData, matchContext, 5, stagedQuery.stage);

    if (formatted.candidates.length > 0) {
      endTimer("analyze:supabase_exact_lookup");
      endTimer("analyze:supabase_lookup");
      return {
        candidates: formatted.candidates,
        searchQuery: describe,
        matchTarget,
        dedupeDebug: formatted.dedupeDebug,
      };
    }
  }
  endTimer("analyze:supabase_exact_lookup");

  if (names.length === 0 || gameKey === "unknown") {
    endTimer("analyze:supabase_lookup");
    return {
      candidates: [],
      searchQuery: null,
      matchTarget,
    };
  }

  endTimer("analyze:supabase_lookup");
  startTimer("analyze:fallback_lookup");

  if (!exactNameAttempted) {
    const exactNameResult = await findExactNameMatches({
      supabase,
      gameKey,
      names,
      cardData,
      matchContext,
    });

    if (exactNameResult.candidates.length > 0) {
      endTimer("analyze:fallback_lookup");
      return {
        candidates: exactNameResult.candidates,
        searchQuery: exactNameResult.searchQuery,
        matchTarget,
        dedupeDebug: exactNameResult.dedupeDebug,
      };
    }
  }

  if (names.length === 0) for (const number of numberLookupValues) {
    const numberPrefixQuery = applyKnownGameFilter(createSupabaseCardQuery(supabase), gameKey)
      .ilike("number", `${number}/%`)
      .limit(8);

    const { data: numberPrefixData, error: numberPrefixError } = await numberPrefixQuery;

    if (numberPrefixError) {
      throw numberPrefixError;
    }

    const formatted = formatMatches(numberPrefixData || [], cardData, matchContext, 3, "number prefix fallback");

    if (formatted.candidates.length > 0) {
      endTimer("analyze:fallback_lookup");
      return {
        candidates: formatted.candidates,
        searchQuery: `fallback game=${gameKey} | number prefix=${number}/%`,
        matchTarget,
        dedupeDebug: formatted.dedupeDebug,
      };
    }
  }

  // Final fallback only. Keep this game-filtered and low-limit; pg_trgm on
  // name is the right long-term index for multilingual fuzzy search.
  for (const pattern of getFuzzyNamePatterns(names)) {
    const fuzzyNameQuery = applyKnownGameFilter(createSupabaseCardQuery(supabase), gameKey)
      .ilike("name", pattern)
      .limit(8);

    const { data: fuzzyNameData, error: fuzzyNameError } = await fuzzyNameQuery;

    if (fuzzyNameError) {
      throw fuzzyNameError;
    }

    const formatted = formatMatches(fuzzyNameData || [], cardData, matchContext, 3, "fuzzy name fallback");

    if (formatted.candidates.length > 0) {
      endTimer("analyze:fallback_lookup");
      return {
        candidates: formatted.candidates,
        searchQuery: [
          targetPrintedTotal ? `printed_total=${targetPrintedTotal}` : null,
          numberLookupValues.length > 0 ? `number attempted (${numberLookupValues.join(", ")})` : "number unavailable",
          `fallback game=${gameKey}`,
          `name ~~* ${pattern}`,
        ].filter(Boolean).join(" | "),
        matchTarget,
        dedupeDebug: formatted.dedupeDebug,
      };
    }
  }

  endTimer("analyze:fallback_lookup");

  return {
    candidates: [],
    searchQuery: [
      targetPrintedTotal ? `printed_total=${targetPrintedTotal}` : null,
      numberLookupValues.length > 0 ? `number attempted (${numberLookupValues.join(", ")})` : "number unavailable",
      `fallback game=${gameKey}`,
      `name attempted (${names.join(", ")})`,
    ].filter(Boolean).join(" | "),
    matchTarget,
  };
}
