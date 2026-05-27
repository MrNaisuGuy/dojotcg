import { createClient } from "@supabase/supabase-js";
import https from "node:https";
import { readFile } from "node:fs/promises";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI/Vercel can provide env vars directly.
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = Number(process.env.ONEPIECE_SYNC_BATCH_SIZE || 250);
const requestDelayMs = Number(process.env.ONEPIECE_SYNC_REQUEST_DELAY_MS || 750);
const requestTimeoutMs = Number(process.env.ONEPIECE_SYNC_REQUEST_TIMEOUT_MS || 60000);
const maxRequestAttempts = Number(process.env.ONEPIECE_SYNC_MAX_REQUEST_ATTEMPTS || 3);
const drfPageSize = Number(process.env.ONEPIECE_SYNC_DRF_PAGE_SIZE || 100);
const dryRun = process.env.ONEPIECE_SYNC_DRY_RUN === "true";
const seriesLimit = Number(process.env.ONEPIECE_SYNC_SERIES_LIMIT || 0);
const forceIpv4 = process.env.ONEPIECE_SYNC_FORCE_IPV4 === "true";
const includeDonCards = process.env.ONEPIECE_SYNC_INCLUDE_DON === "true";
const useBulkCardEndpoints = process.env.ONEPIECE_SYNC_USE_BULK_ENDPOINTS === "true";
const syncProvider = process.env.ONEPIECE_SYNC_PROVIDER || "official";
const sourceFiles = splitList(process.env.ONEPIECE_SYNC_SOURCE_FILE || process.env.ONEPIECE_SYNC_SOURCE_FILES);
const sourceUrls = splitList(process.env.ONEPIECE_SYNC_SOURCE_URL || process.env.ONEPIECE_SYNC_SOURCE_URLS);
const officialBaseUrl = "https://en.onepiece-cardgame.com/cardlist/";
const officialSourceName = "official-bandai-cardlist";

const sourceGroups = [
  {
    category: "sets",
    bulkUrl: "https://optcgapi.com/api/allSetCards/?format=json",
    indexUrl: "https://optcgapi.com/api/allSets/?format=json",
    childPath: "sets",
    getChildIds: getSetIds,
  },
  {
    category: "starter-decks",
    bulkUrl: "https://optcgapi.com/api/allSTCards/?format=json",
    indexUrl: "https://optcgapi.com/api/allDecks/?format=json",
    childPath: "decks",
    getChildIds: getStarterDeckIds,
  },
  {
    category: "promos",
    bulkUrl: "https://optcgapi.com/api/allPromoCards/?format=json",
  },
  ...(includeDonCards ? [{ category: "don", url: "https://optcgapi.com/api/allDonCards/?format=json" }] : []),
];

if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = dryRun
  ? null
  : createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: class SyncDisabledWebSocket {},
      },
    });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFallbackUrls(url) {
  const parsedUrl = new URL(url);
  const urls = [url];

  if (parsedUrl.hostname === "optcgapi.com") {
    parsedUrl.hostname = "www.optcgapi.com";
    urls.push(parsedUrl.toString());
  }

  return urls;
}

function withJsonFormat(url) {
  const parsedUrl = new URL(url);

  parsedUrl.searchParams.set("format", "json");
  return parsedUrl.toString();
}

function withDrfPageParams(url, offset = 0) {
  const parsedUrl = new URL(withJsonFormat(url));

  if (drfPageSize > 0) {
    parsedUrl.searchParams.set("limit", String(drfPageSize));
    parsedUrl.searchParams.set("offset", String(offset));
  }

  return parsedUrl.toString();
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const request = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        timeout: requestTimeoutMs,
        family: forceIpv4 ? 4 : undefined,
        headers: {
          Accept: "application/json",
          "User-Agent": "DojoTCG/0.0.1",
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          resolve(requestJson(new URL(response.headers.location, url).toString()));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 500)}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Could not parse JSON from ${url}: ${error.message}`));
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`));
    });
    request.on("error", reject);
    request.end();
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const request = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        timeout: requestTimeoutMs,
        family: forceIpv4 ? 4 : undefined,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "DojoTCG/0.0.1",
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 500)}`));
            return;
          }

          resolve(body);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`));
    });
    request.on("error", reject);
    request.end();
  });
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

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getClassText(html, className) {
  const match = html.match(new RegExp(`<div class="${className}"[^>]*>([\\s\\S]*?)<\\/div>`, "i"));

  if (!match) return null;

  return stripHtml(match[1].replace(/<h3>[\s\S]*?<\/h3>/i, ""));
}

function getOfficialSetInfo(value) {
  const text = stripHtml(value);
  const setId = text.match(/\[([A-Z]{2,4}-?\d{2}(?:-[A-Z]{2}\d{2})?)\]/)?.[1] || null;
  const setName = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim() || null;

  return { setName, setId };
}

function parseOfficialSeriesOptions(html) {
  return [...html.matchAll(/<option\s+value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((match) => {
      const { setName, setId } = getOfficialSetInfo(match[2]);

      return {
        id: match[1],
        label: stripHtml(match[2]),
        setName,
        setId,
      };
    });
}

function parseOfficialCards(html, series) {
  return [...html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)]
    .map((match) => {
      const [, modalId, cardHtml] = match;
      const infoSpans = [...cardHtml.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((span) => stripHtml(span[1]));
      const imagePath = cardHtml.match(/data-src="([^"]+)"/i)?.[1] || null;
      const imageUrl = imagePath ? new URL(imagePath, officialBaseUrl).toString() : null;
      const printedId = infoSpans[0] || normalizeOnePieceCardId(modalId);
      const rarity = infoSpans[1] || null;
      const cardType = infoSpans[2] || null;
      const name = stripHtml(cardHtml.match(/<div class="cardName">([\s\S]*?)<\/div>/i)?.[1] || "");
      const cardSetText = getClassText(cardHtml, "getInfo");
      const cardSetInfo = getOfficialSetInfo(cardSetText || "");

      return {
        card_name: name || null,
        card_set_id: printedId,
        set_name: cardSetInfo.setName || series.setName,
        set_id: cardSetInfo.setId || series.setId,
        rarity,
        card_type: cardType,
        card_color: getClassText(cardHtml, "color"),
        card_text: getClassText(cardHtml, "text"),
        trigger: getClassText(cardHtml, "trigger"),
        life: getClassText(cardHtml, "life"),
        card_cost: getClassText(cardHtml, "cost"),
        card_power: getClassText(cardHtml, "power"),
        counter_amount: getClassText(cardHtml, "counter"),
        attribute: getClassText(cardHtml, "attribute"),
        sub_types: getClassText(cardHtml, "feature"),
        block: getClassText(cardHtml, "block"),
        card_image_id: modalId,
        card_image: imageUrl,
        source_url: new URL(`?series=${series.id}`, officialBaseUrl).toString(),
      };
    });
}

function normalizeOptcgSetId(value) {
  return String(value || "").trim().toUpperCase().replace(/^([A-Z]+)-(\d+)$/, "$1$2");
}

function getEndpointIdCandidates(value) {
  const raw = String(value || "").trim().toUpperCase();
  const compact = normalizeOptcgSetId(raw);

  return [...new Set([raw, compact].filter(Boolean))];
}

function getSetIds(set) {
  const setId = getFirstValue(set, ["set_id", "setId", "id"]);

  return getEndpointIdCandidates(setId);
}

function getStarterDeckIds(deck) {
  const deckId = getFirstValue(deck, [
    "structure_deck_id",
    "structureDeckId",
    "deck_id",
    "deckId",
    "st_id",
    "stId",
    "id",
  ]);

  return getEndpointIdCandidates(deckId);
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
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

  return {
    price_usd: marketPrice ?? inventoryPrice,
    price_source: marketPrice !== null || inventoryPrice !== null ? getSourceName(card, "optcgapi") : null,
    price_variant: null,
    price_updated_at: new Date().toISOString().slice(0, 10),
  };
}

function getSourceName(card, category) {
  if (card?.source_name) return card.source_name;
  if (card?.source) return card.source;
  if (card?.source_url && String(card.source_url).includes("onepiece-cardgame.com")) return officialSourceName;
  if (category === "official") return officialSourceName;
  if (category === "import") return "onepiece-import";

  return "optcgapi.com";
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

function getCardName(card) {
  return getFirstValue(card, [
    "card_name",
    "cardName",
    "name",
    "card",
  ]);
}

function getCardId(card) {
  return normalizeOnePieceCardId(getFirstValue(card, [
    "card_set_id",
    "cardSetId",
    "card_id",
    "cardID",
    "cardId",
    "card_number",
    "cardNumber",
    "number",
    "image_id",
    "imageId",
  ]));
}

function getExternalId(card, category, cardId, name) {
  const apiId = getFirstValue(card, ["id", "pk", "tcgplayer_id", "tcgplayerId"]);
  const variant = getFirstValue(card, [
    "card_image_id",
    "cardImageId",
    "image_id",
    "imageId",
    "variant",
    "rarity",
  ]);

  if (apiId) return `optcg:${category}:${apiId}`;

  return `optcg:${category}:${cardId || "unknown"}:${slugify([name, variant].filter(Boolean).join("-"))}`;
}

function normalizeCard(card, category) {
  const cardId = getCardId(card);
  const name = getCardName(card);
  const priceData = getPriceData(card);

  if (!cardId && !name) return null;

  return {
    game: "onepiece",
    external_id: getExternalId(card, category, cardId, name),
    name,
    set_name: getFirstValue(card, ["set_name", "setName", "set"]),
    set_id: getFirstValue(card, ["set_id", "setId", "set_code", "setCode"]),
    number: cardId,
    printed_total: null,
    rarity: getFirstValue(card, ["rarity", "card_rarity", "cardRarity"]),
    image_url: getImageUrl(card),
    ...priceData,
    source: getSourceName(card, category),
    raw: {
      ...card,
      optcg_source_category: category,
      optcg_card_id: cardId,
    },
    updated_at: new Date().toISOString(),
  };
}

function extractCards(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.cards)) return body.cards;

  if (body && typeof body === "object") {
    const groupedCards = Object.values(body)
      .filter(Array.isArray)
      .flat();

    if (groupedCards.length > 0) return groupedCards;
  }

  return [];
}

function getDrfNextUrl(body) {
  return typeof body?.next === "string" && body.next ? withJsonFormat(body.next) : null;
}

function getImportCategory(sourceLabel) {
  const normalized = sourceLabel.toLowerCase();

  if (normalized.includes("promo")) return "promos";
  if (normalized.includes("don")) return "don";
  if (normalized.includes("deck") || normalized.includes("stcard") || normalized.includes("starter")) return "starter-decks";
  if (normalized.includes("set")) return "sets";

  return "import";
}

async function fetchSourceOverrideCards() {
  const sources = [
    ...sourceFiles.map((file) => ({ type: "file", value: file })),
    ...sourceUrls.map((url) => ({ type: "url", value: url })),
  ];

  if (sources.length === 0) return null;

  const allCards = [];

  for (const source of sources) {
    console.info(`Loading One Piece cards from ${source.value}...`);

    const body = source.type === "file"
      ? JSON.parse(await readFile(source.value, "utf8"))
      : await requestJson(source.value);
    const cards = extractCards(body);

    if (cards.length === 0) {
      throw new Error(`No cards found in ${source.value}. Expected an array, { data: [...] }, { cards: [...] }, or grouped arrays.`);
    }

    allCards.push(...cards.map((card) => ({
      card,
      category: getImportCategory(source.value),
    })));
  }

  return allCards;
}

async function fetchOptcgJson(source) {
  let lastError = null;

  for (const url of getFallbackUrls(source.url || source.bulkUrl)) {
    for (let attempt = 1; attempt <= maxRequestAttempts; attempt += 1) {
      try {
        return await requestJson(url);
      } catch (error) {
        lastError = error;
        const delayMs = requestDelayMs * attempt;

        console.warn(
          `OPTCG ${source.category} request failed (${attempt}/${maxRequestAttempts}) for ${url}: ${error.message}`,
        );

        if (attempt < maxRequestAttempts && delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  }

  throw new Error(`OPTCG sync failed for ${source.category}: ${lastError?.message || "unknown error"}`);
}

async function fetchOptcgCards(source) {
  let nextUrl = withDrfPageParams(source.url || source.bulkUrl);
  const cards = [];
  let page = 1;

  while (nextUrl) {
    const body = await fetchOptcgJson({
      ...source,
      category: page === 1 ? source.category : `${source.category} page ${page}`,
      url: nextUrl,
    });
    const pageCards = extractCards(body);
    cards.push(...pageCards);
    nextUrl = getDrfNextUrl(body);

    if (nextUrl) {
      console.info(`Fetched ${cards.length}${body.count ? `/${body.count}` : ""} OPTCG ${source.category} cards...`);
      page += 1;

      if (requestDelayMs > 0) {
        await sleep(requestDelayMs);
      }
    }
  }

  return cards;
}

async function fetchOptcgSource(source) {
  if (source.indexUrl && !useBulkCardEndpoints) {
    const indexBody = await fetchOptcgJson({
      category: `${source.category} index`,
      url: source.indexUrl,
    });
    const indexRows = extractCards(indexBody);
    const cards = [];

    console.info(`Found ${indexRows.length} OPTCG ${source.category} entries.`);

    for (const row of indexRows) {
      const childIds = source.getChildIds(row);

      if (childIds.length === 0) {
        console.warn(`Skipping OPTCG ${source.category} entry with no id: ${JSON.stringify(row)}`);
        continue;
      }

      let childBody = null;
      let childError = null;

      for (const childId of childIds) {
        try {
          console.info(`Fetching OPTCG ${source.category} ${childId}...`);
          childBody = await fetchOptcgJson({
            category: `${source.category} ${childId}`,
            url: withJsonFormat(`https://optcgapi.com/api/${source.childPath}/${childId}/`),
          });
          break;
        } catch (error) {
          childError = error;
        }
      }

      if (!childBody) {
        throw childError || new Error(`Could not fetch OPTCG ${source.category} ${childIds.join("/")}`);
      }

      cards.push(...extractCards(childBody));

      if (requestDelayMs > 0) {
        await sleep(requestDelayMs);
      }
    }

    return cards;
  }

  return fetchOptcgCards(source);
}

async function fetchOfficialOnePieceCards() {
  const firstUrl = new URL("?series=569115", officialBaseUrl).toString();
  const firstHtml = await requestText(firstUrl);
  const seriesOptions = parseOfficialSeriesOptions(firstHtml);
  const cards = [];

  if (seriesOptions.length === 0) {
    throw new Error("Could not find official One Piece series options.");
  }

  console.info(`Found ${seriesOptions.length} official One Piece series entries.`);

  const selectedSeries = seriesLimit > 0 ? seriesOptions.slice(0, seriesLimit) : seriesOptions;

  for (const series of selectedSeries) {
    console.info(`Fetching official One Piece series ${series.id}: ${series.label}`);
    const html = series.id === "569115"
      ? firstHtml
      : await requestText(new URL(`?series=${series.id}`, officialBaseUrl).toString());
    const seriesCards = parseOfficialCards(html, series);

    console.info(`Parsed official One Piece series ${series.id}: ${seriesCards.length} cards.`);
    cards.push(...seriesCards);

    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  return cards;
}

async function upsertRows(rows) {
  if (dryRun) {
    console.info(`Dry run: would upsert ${rows.length} rows.`);
    console.table(rows.slice(0, 5).map((row) => ({
      external_id: row.external_id,
      name: row.name,
      set_name: row.set_name,
      number: row.number,
      rarity: row.rarity,
      image_url: row.image_url,
    })));
    return;
  }

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from("cards").upsert(batch, {
      onConflict: "external_id",
    });

    if (error) throw error;
  }
}

async function printSyncSummary() {
  if (dryRun) return;

  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("game", "onepiece");

  if (error) {
    console.warn("Could not read One Piece card count after sync.", error);
    return;
  }

  const { data, error: sampleError } = await supabase
    .from("cards")
    .select("external_id,name,set_name,number,rarity,price_usd,price_variant")
    .eq("game", "onepiece")
    .order("updated_at", { ascending: false })
    .limit(5);

  console.info(`Supabase now has ${count} One Piece cards.`);

  if (sampleError) {
    console.warn("Could not read One Piece card sample after sync.", sampleError);
  } else {
    console.table(data);
  }
}

async function syncOnePieceCards() {
  let totalSynced = 0;
  const sourceOverrideCards = await fetchSourceOverrideCards();

  if (sourceOverrideCards) {
    const rows = sourceOverrideCards
      .map(({ card, category }) => normalizeCard(card, category))
      .filter(Boolean);

    await upsertRows(rows);
    totalSynced += rows.length;
    console.info(`Synced imported One Piece cards: ${rows.length} cards.`);
    await printSyncSummary();
    return;
  }

  if (syncProvider === "official") {
    console.info("Fetching One Piece cards from the official Bandai card list...");
    const cards = await fetchOfficialOnePieceCards();
    const rows = cards
      .map((card) => normalizeCard(card, "official"))
      .filter(Boolean);

    await upsertRows(rows);
    totalSynced += rows.length;
    console.info(`Synced official One Piece cards: ${rows.length} cards.`);
    await printSyncSummary();
    return;
  }

  for (const source of sourceGroups) {
    console.info(`Fetching OPTCG ${source.category} cards...`);
    const cards = await fetchOptcgSource(source);
    const rows = cards
      .map((card) => normalizeCard(card, source.category))
      .filter(Boolean);

    await upsertRows(rows);
    totalSynced += rows.length;
    console.info(`Synced OPTCG ${source.category}: ${rows.length} cards.`);

    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  console.info(`One Piece sync complete: ${totalSynced} cards.`);
  await printSyncSummary();
}

syncOnePieceCards().catch((error) => {
  console.error(error);
  process.exit(1);
});
