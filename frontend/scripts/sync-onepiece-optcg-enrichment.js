import { createClient } from "@supabase/supabase-js";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI/Vercel can provide env vars directly.
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = Number(process.env.ONEPIECE_ENRICH_BATCH_SIZE || 1000);
const requestDelayMs = Number(process.env.ONEPIECE_ENRICH_REQUEST_DELAY_MS || 2500);
const requestTimeoutMs = Number(process.env.ONEPIECE_ENRICH_REQUEST_TIMEOUT_MS || 30000);
const maxCards = Number(process.env.ONEPIECE_ENRICH_MAX_CARDS || 0);
const maxRequests = Number(process.env.ONEPIECE_ENRICH_MAX_REQUESTS || 0);
const skipRecentDays = Number(process.env.ONEPIECE_ENRICH_SKIP_RECENT_DAYS || 7);
const startAfter = normalizeOnePieceCardId(process.env.ONEPIECE_ENRICH_START_AFTER);
const dryRun = process.env.ONEPIECE_ENRICH_DRY_RUN === "true";
const supabaseMaxAttempts = readPositiveNumber(process.env.ONEPIECE_ENRICH_SUPABASE_MAX_ATTEMPTS, 5);
const supabaseRetryDelayMs = readPositiveNumber(process.env.ONEPIECE_ENRICH_SUPABASE_RETRY_DELAY_MS, 2000);

class OptcgRateLimitError extends Error {
  constructor(message, retryAfterSeconds = null) {
    super(message);
    this.name = "OptcgRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: class EnrichmentDisabledWebSocket {},
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getErrorText(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.status,
    error?.name,
  ]
    .filter(Boolean)
    .join(" ");
}

function isRetryableSupabaseError(error) {
  const status = Number(error?.status);
  if (status === 408 || status === 429 || status >= 500) return true;

  return /fetch failed|network|socket|und_err|econnreset|etimedout|timeout|terminated/i.test(getErrorText(error));
}

async function runSupabaseQuery(queryFactory, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= supabaseMaxAttempts; attempt += 1) {
    try {
      const result = await queryFactory();

      if (!result?.error) return result;

      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    if (attempt >= supabaseMaxAttempts || !isRetryableSupabaseError(lastError)) {
      throw lastError;
    }

    const delayMs = Math.min(supabaseRetryDelayMs * 2 ** (attempt - 1), 30000);
    console.warn(
      `Supabase ${label} failed (${attempt}/${supabaseMaxAttempts}): ${getErrorText(lastError) || "unknown error"}. Retrying in ${delayMs}ms.`,
    );
    await sleep(delayMs);
  }

  throw lastError;
}

function normalizeOnePieceCardId(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/\b(?:OP|ST|EB|PRB)\d{2}-\d{3}\b|\bP-\d{3}\b/);

  return match ? match[0] : null;
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value || "").replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getFirstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function getImageUrl(card) {
  return getFirstValue(card, [
    "card_image",
    "card_image_url",
    "cardImage",
    "cardImageUrl",
    "image_url",
    "image",
  ]);
}

function getPriceData(card) {
  const marketPrice = parsePrice(getFirstValue(card, [
    "market_price",
    "marketPrice",
    "market",
    "tcgplayer_market_price",
    "tcgplayerMarketPrice",
  ]));
  const inventoryPrice = parsePrice(getFirstValue(card, [
    "inventory_price",
    "inventoryPrice",
    "price",
    "low_price",
    "lowPrice",
  ]));
  const price = marketPrice ?? inventoryPrice;

  return {
    price_usd: price,
    price_variant: marketPrice !== null ? "market" : inventoryPrice !== null ? "inventory" : null,
    price_updated_at: price === null ? null : new Date().toISOString().slice(0, 10),
  };
}

function getOptcgUpdatedAt(row) {
  const value = row.price_updated_at || row.updated_at;
  const time = value ? new Date(value).getTime() : NaN;

  return Number.isFinite(time) ? time : null;
}

function shouldSkipRecent(row) {
  if (skipRecentDays <= 0) return false;

  const updatedAt = getOptcgUpdatedAt(row);
  if (!updatedAt) return false;

  return Date.now() - updatedAt < skipRecentDays * 24 * 60 * 60 * 1000;
}

function getOptcgEndpoints(cardId) {
  const endpoints = {
    sets: { type: "sets", url: `https://optcgapi.com/api/sets/card/${cardId}/?format=json` },
    decks: { type: "decks", url: `https://optcgapi.com/api/decks/card/${cardId}/?format=json` },
    promos: { type: "promos", url: `https://optcgapi.com/api/promos/card/${cardId}/?format=json` },
  };

  if (cardId.startsWith("ST")) return [endpoints.decks, endpoints.sets, endpoints.promos];
  if (cardId.startsWith("P-")) return [endpoints.promos, endpoints.sets, endpoints.decks];

  return [endpoints.sets, endpoints.decks, endpoints.promos];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "DojoTCG/0.0.1",
      },
    });

    if (response.status === 404) return null;

    if (response.status === 429) {
      const errorText = await response.text();
      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const retryAfterBody = Number(errorText.match(/available in (\d+) seconds/i)?.[1]);
      const retryAfterSeconds = Number.isFinite(retryAfterHeader)
        ? retryAfterHeader
        : Number.isFinite(retryAfterBody)
          ? retryAfterBody
          : null;

      throw new OptcgRateLimitError(`429 ${errorText.slice(0, 500)}`, retryAfterSeconds);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText.slice(0, 500)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestOptcgCard(body, cardId) {
  const cards = Array.isArray(body) ? body : body ? [body] : [];

  return (
    cards.find((card) => normalizeOnePieceCardId(
      card.card_set_id ||
        card.cardSetId ||
        card.card_id ||
        card.cardID ||
        card.cardId ||
        card.number ||
        card.card_image_id,
    ) === cardId && getImageUrl(card)) ||
    cards.find((card) => getImageUrl(card)) ||
    cards[0] ||
    null
  );
}

async function fetchOptcgCard(cardId) {
  for (const endpoint of getOptcgEndpoints(cardId)) {
    const body = await fetchJson(endpoint.url);
    const card = pickBestOptcgCard(body, cardId);

    if (card) {
      return {
        endpointType: endpoint.type,
        card,
      };
    }
  }

  return null;
}

async function fetchOnePieceCards() {
  const rows = [];

  for (let from = 0; ; from += batchSize) {
    const to = from + batchSize - 1;
    const { data } = await runSupabaseQuery(
      () => supabase
        .from("cards")
        .select("id,external_id,game,name,number,image_url,price_usd,price_variant,price_updated_at,updated_at")
        .eq("game", "onepiece")
        .not("number", "is", null)
        .order("number", { ascending: true })
        .range(from, to),
      `select cards ${from}-${to}`,
    );

    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < batchSize) break;
    if (maxCards > 0 && rows.length >= maxCards) break;
  }

  return maxCards > 0 ? rows.slice(0, maxCards) : rows;
}

async function updateRows(rows, enrichmentByCardId) {
  let updated = 0;

  for (const row of rows) {
    const cardId = normalizeOnePieceCardId(row.number);
    const enrichment = enrichmentByCardId.get(cardId);

    if (!enrichment) continue;

    const { card } = enrichment;
    const imageUrl = getImageUrl(card);
    const priceData = getPriceData(card);
    const update = {
      image_url: imageUrl || row.image_url,
      updated_at: new Date().toISOString(),
    };

    if (priceData.price_usd !== null) {
      update.price_usd = priceData.price_usd;
      update.price_variant = priceData.price_variant;
      update.price_updated_at = priceData.price_updated_at;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    await runSupabaseQuery(
      () => supabase
        .from("cards")
        .update(update)
        .eq("id", row.id),
      `update card ${row.number || row.id}`,
    );

    updated += 1;
  }

  return updated;
}

async function syncOnePieceOptcgEnrichment() {
  const rows = await fetchOnePieceCards();
  const rowsToCheck = rows.filter((row) => {
    const cardId = normalizeOnePieceCardId(row.number);

    if (!cardId) return false;
    if (startAfter && cardId <= startAfter) return false;
    return !shouldSkipRecent(row);
  });
  const allCardIds = [...new Set(rowsToCheck.map((row) => normalizeOnePieceCardId(row.number)).filter(Boolean))];
  const cardIds = maxRequests > 0 ? allCardIds.slice(0, maxRequests) : allCardIds;
  const enrichmentByCardId = new Map();
  let misses = 0;
  let rateLimited = false;

  console.info(`Found ${rows.length} One Piece rows.`);
  console.info(`Checking ${cardIds.length}/${allCardIds.length} unique card numbers after filters.`);

  for (const [index, cardId] of cardIds.entries()) {
    try {
      const enrichment = await fetchOptcgCard(cardId);

      if (enrichment) {
        enrichmentByCardId.set(cardId, enrichment);
      } else {
        misses += 1;
      }
    } catch (error) {
      if (error instanceof OptcgRateLimitError) {
        rateLimited = true;
        console.warn(
          `OPTCG rate limit reached at ${cardId}. Retry after ${error.retryAfterSeconds ?? "unknown"} seconds. Stopping this run.`,
        );
        break;
      }

      misses += 1;
      console.warn(`Could not enrich ${cardId}: ${error.message}`);
    }

    if ((index + 1) % 50 === 0) {
      console.info(`Checked ${index + 1}/${cardIds.length} OPTCG card numbers.`);
    }

    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  console.info(`Matched ${enrichmentByCardId.size} OPTCG card numbers. Missed ${misses}.`);

  if (dryRun) {
    console.table([...enrichmentByCardId.entries()].slice(0, 10).map(([cardId, enrichment]) => ({
      number: cardId,
      endpoint: enrichment.endpointType,
      image_url: getImageUrl(enrichment.card),
      price_usd: getPriceData(enrichment.card).price_usd,
    })));
  }

  const updated = await updateRows(rows, enrichmentByCardId);
  console.info(`${dryRun ? "Dry run: would update" : "Updated"} ${updated} One Piece rows.`);

  if (rateLimited) {
    console.info("Run stopped early because OPTCG throttled requests. Already matched rows were still processed.");
  }
}

syncOnePieceOptcgEnrichment().catch((error) => {
  console.error(error);
  process.exit(1);
});
