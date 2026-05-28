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
  "price_source",
  "price_variant",
  "price_updated_at",
].join(",");
const UNDEFINED_RPC_FUNCTION_CODES = new Set(["42883", "PGRST202"]);
const LOOKUP_STAGE_STRENGTH = {
  "exact external_id": 5,
  "exact game + set_id + number": 4,
  "exact game + number": 3,
  "exact lower(name)": 2,
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
    priceSource: card.price_source,
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

  const match = scoreCandidate(matchContext, candidateMatchData);
  const dedupeKeys = getCandidateDedupeKeys(candidate);

  return {
    ...candidate,
    regionalPrices,
    matchScore: match.score,
    matchReasons: match.reasons,
    lookupStage,
    lookupStages: [lookupStage].filter(Boolean),
    ...(isAnalyzeDebugEnabled()
      ? {
          matchDebug: {
            confidence: match.confidence,
            confidenceReason: match.confidenceReason,
            matchedFields: match.matchedFields,
            conflictingFields: match.conflictingFields,
            scoreBreakdown: match.scoreBreakdown,
            dedupeKeys,
            lookupStages: [lookupStage].filter(Boolean),
          },
        }
      : {}),
  };
}

function getSetIdLookupValues(cardData, onePieceCardId) {
  const onePieceSetId = onePieceCardId?.match(/^([A-Z]+[0-9]{2})-/)?.[1];
  const values = [
    cardData.setId,
    cardData.set_id,
    cardData.setCode,
    onePieceSetId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .flatMap((value) => [value, value.toUpperCase(), value.toLowerCase()]);

  return uniqueValues(values);
}

function getNumberLookupValues(cardData, onePieceCardId) {
  const onePieceNumber = onePieceCardId?.match(/-(\d{3})$/)?.[1];

  return uniqueValues([
    ...getCollectorNumberLookupValues(cardData.collectorNumber || cardData.number),
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
    .map((value) => value.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return uniqueValues([...exactNames, ...normalizedNames]);
}

function getLowerNameLookupValues(names) {
  return uniqueValues(names
    .map((name) => String(name || "").toLowerCase().trim())
    .filter(Boolean));
}

function getFuzzyNamePatterns(names) {
  return uniqueValues(names.flatMap((name) => {
    const normalizedName = String(name || "").trim().replace(/[,()]/g, " ").replace(/\s+/g, " ");

    return normalizedName ? [normalizedName, `${normalizedName}%`, `%${normalizedName}%`] : [];
  }));
}

async function findExactLowerNameMatches({ supabase, gameKey, names, cardData, matchContext }) {
  const lowerNames = getLowerNameLookupValues(names);

  if (lowerNames.length === 0) return { candidates: [], usedFallback: false };

  try {
    const { data, error } = await supabase.rpc("lookup_cards_by_lower_name", {
      p_game: gameKey,
      p_names: lowerNames,
      p_limit: 8,
    });

    if (error) throw error;

    const formatted = formatMatches(data || [], cardData, matchContext, 3, "exact lower(name)");

    return {
      candidates: formatted.candidates,
      dedupeDebug: formatted.dedupeDebug,
      searchQuery: `fallback game=${gameKey} | lower(name) in (${lowerNames.join(", ")})`,
      usedFallback: false,
    };
  } catch (error) {
    if (!UNDEFINED_RPC_FUNCTION_CODES.has(error.code)) {
      throw error;
    }

    // The RPC is what lets Postgres use the lower(name) expression index from
    // Supabase/PostgREST. Keep a compatibility fallback for environments where
    // the SQL helper has not been deployed yet.
    const exactNameQuery = applyKnownGameFilter(createSupabaseCardQuery(supabase), gameKey)
      .in("name", names)
      .limit(8);

    const { data, error: exactNameError } = await exactNameQuery;

    if (exactNameError) throw exactNameError;
    const formatted = formatMatches(data || [], cardData, matchContext, 3, "exact lower(name)");

    return {
      candidates: formatted.candidates,
      dedupeDebug: formatted.dedupeDebug,
      searchQuery: `fallback game=${gameKey} | exact name in (${names.join(", ")})`,
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
    .slice(0, limit);
  const deduped = dedupeCandidateMatches(matches);

  return {
    candidates: deduped.candidates,
    dedupeDebug: {
      beforeCount: rawDedupe.debug.beforeCount,
      afterCount: deduped.debug.afterCount,
      keysUsed: uniqueValues([...rawDedupe.debug.keysUsed, ...deduped.debug.keysUsed]),
      stagesByKey: {
        ...rawDedupe.debug.stagesByKey,
        ...deduped.debug.stagesByKey,
      },
    },
  };
}

export async function findLocalCandidates(cardData, supabase) {
  startTimer("analyze:supabase_lookup");
  const matchTarget = getMatchTarget(cardData);
  const matchContext = buildMatchContext(cardData);
  const gameKey = getGameKey(cardData.game);
  const { printedTotal } = parseCollectorNumber(cardData.collectorNumber || cardData.number);
  const onePieceCardId = gameKey === "onepiece"
    ? normalizeOnePieceCardId(cardData.cardID || cardData.cardId || cardData.collectorNumber || cardData.number)
    : null;
  const numberLookupValues = getNumberLookupValues(cardData, onePieceCardId);
  const externalIdLookupValues = getExternalIdLookupValues(cardData, onePieceCardId);
  const setIdLookupValues = getSetIdLookupValues(cardData, onePieceCardId);
  const targetPrintedTotal = normalizePrintedTotal(cardData.printedTotal) || printedTotal;
  const names = getNameLookupValues(cardData);

  if (!supabase) {
    endTimer("analyze:supabase_lookup");
    return {
      candidates: [],
      searchQuery: null,
      matchTarget,
    };
  }

  const stagedQueries = [];

  // Fast path: simple equality predicates that match composite btree indexes.
  if (gameKey !== "unknown" && setIdLookupValues.length > 0 && numberLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact game + set_id + number",
      describe: `game=${gameKey} | set_id in (${setIdLookupValues.join(", ")}) | number in (${numberLookupValues.join(", ")})`,
      limit: 10,
      apply: (query) => query
        .in("set_id", setIdLookupValues)
        .in("number", numberLookupValues),
    });
  }

  if (gameKey !== "unknown" && numberLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact game + number",
      describe: `game=${gameKey} | number in (${numberLookupValues.join(", ")})`,
      limit: 20,
      apply: (query) => query.in("number", numberLookupValues),
    });
  }

  if (gameKey !== "unknown" && externalIdLookupValues.length > 0) {
    stagedQueries.push({
      stage: "exact external_id",
      describe: `game=${gameKey} | external_id in (${externalIdLookupValues.join(", ")})`,
      limit: 10,
      apply: (query) => query.in("external_id", externalIdLookupValues),
    });
  }

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
      endTimer("analyze:supabase_lookup");
      return {
        candidates: formatted.candidates,
        searchQuery: describe,
        matchTarget,
        dedupeDebug: formatted.dedupeDebug,
      };
    }
  }

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

  const exactNameResult = await findExactLowerNameMatches({
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

  for (const number of numberLookupValues) {
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
