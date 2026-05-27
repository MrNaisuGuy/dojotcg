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
const requestDelayMs = Number(process.env.ONEPIECE_ENRICH_REQUEST_DELAY_MS || 250);
const requestTimeoutMs = Number(process.env.ONEPIECE_ENRICH_REQUEST_TIMEOUT_MS || 30000);
const maxCards = Number(process.env.ONEPIECE_ENRICH_MAX_CARDS || 0);
const dryRun = process.env.ONEPIECE_ENRICH_DRY_RUN === "true";

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
    price_source: price === null ? null : "optcgapi.com",
    price_variant: marketPrice !== null ? "market" : inventoryPrice !== null ? "inventory" : null,
    price_updated_at: price === null ? null : new Date().toISOString().slice(0, 10),
  };
}

function mergeRaw(existingRaw, optcgCard, endpointType) {
  const raw = existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
    ? existingRaw
    : {};

  if (raw.optcg) {
    return {
      ...raw,
      optcg: {
        ...raw.optcg,
        endpoint_type: endpointType,
        card: optcgCard,
        updated_at: new Date().toISOString(),
      },
    };
  }

  return {
    bandai: raw,
    optcg: {
      endpoint_type: endpointType,
      card: optcgCard,
      updated_at: new Date().toISOString(),
    },
  };
}

function getOptcgEndpoints(cardId) {
  return [
    { type: "sets", url: `https://optcgapi.com/api/sets/card/${cardId}/?format=json` },
    { type: "decks", url: `https://optcgapi.com/api/decks/card/${cardId}/?format=json` },
    { type: "promos", url: `https://optcgapi.com/api/promos/card/${cardId}/?format=json` },
  ];
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
    const { data, error } = await supabase
      .from("cards")
      .select("id,external_id,game,name,number,image_url,price_usd,price_source,price_variant,price_updated_at,raw")
      .eq("game", "onepiece")
      .not("number", "is", null)
      .order("number", { ascending: true })
      .range(from, to);

    if (error) throw error;
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

    const { card, endpointType } = enrichment;
    const imageUrl = getImageUrl(card);
    const priceData = getPriceData(card);
    const update = {
      image_url: imageUrl || row.image_url,
      raw: mergeRaw(row.raw, card, endpointType),
      updated_at: new Date().toISOString(),
    };

    if (priceData.price_usd !== null) {
      update.price_usd = priceData.price_usd;
      update.price_source = priceData.price_source;
      update.price_variant = priceData.price_variant;
      update.price_updated_at = priceData.price_updated_at;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    const { error } = await supabase
      .from("cards")
      .update(update)
      .eq("id", row.id);

    if (error) throw error;
    updated += 1;
  }

  return updated;
}

async function syncOnePieceOptcgEnrichment() {
  const rows = await fetchOnePieceCards();
  const cardIds = [...new Set(rows.map((row) => normalizeOnePieceCardId(row.number)).filter(Boolean))];
  const enrichmentByCardId = new Map();
  let misses = 0;

  console.info(`Found ${rows.length} One Piece rows and ${cardIds.length} unique card numbers.`);

  for (const [index, cardId] of cardIds.entries()) {
    try {
      const enrichment = await fetchOptcgCard(cardId);

      if (enrichment) {
        enrichmentByCardId.set(cardId, enrichment);
      } else {
        misses += 1;
      }
    } catch (error) {
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
}

syncOnePieceOptcgEnrichment().catch((error) => {
  console.error(error);
  process.exit(1);
});
