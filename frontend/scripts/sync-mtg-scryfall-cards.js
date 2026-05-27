import { createClient } from "@supabase/supabase-js";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

if (process.loadEnvFile) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI/Vercel can provide env vars directly.
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = Number(process.env.MTG_SYNC_BATCH_SIZE || 500);
const existingPageSize = Number(process.env.MTG_SYNC_EXISTING_PAGE_SIZE || 1000);
const maxCards = Number(process.env.MTG_SYNC_MAX_CARDS || 0);
const dryRun = process.env.MTG_SYNC_DRY_RUN === "true";
const bulkType = process.env.MTG_SYNC_BULK_TYPE || "default_cards";

class StopParsing extends Error {}

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
    transport: class SyncDisabledWebSocket {},
  },
});

function getScryfallImageUrl(card) {
  const imageUris = card.image_uris || card.card_faces?.[0]?.image_uris;

  return imageUris?.normal || imageUris?.large || imageUris?.small || null;
}

function getBestPrice(card) {
  const prices = card.prices || {};
  const entries = [
    ["usd", prices.usd],
    ["usd_foil", prices.usd_foil],
    ["usd_etched", prices.usd_etched],
  ];
  const entry = entries.find(([, value]) => value !== null && value !== undefined && Number.isFinite(Number(value)));

  if (!entry) {
    return {
      price_usd: null,
      price_source: null,
      price_variant: null,
      price_updated_at: null,
    };
  }

  return {
    price_usd: Number(entry[1]),
    price_source: "scryfall",
    price_variant: entry[0],
    price_updated_at: new Date().toISOString().slice(0, 10),
  };
}

function normalizeCard(card) {
  const priceData = getBestPrice(card);

  return {
    game: "mtg",
    external_id: card.id,
    name: card.name || null,
    set_name: card.set_name || null,
    set_id: card.set || null,
    number: card.collector_number || null,
    printed_total: null,
    rarity: card.rarity || null,
    image_url: getScryfallImageUrl(card),
    ...priceData,
    source: "scryfall",
    raw: card,
    updated_at: new Date().toISOString(),
  };
}

function getRowSignature(row) {
  return JSON.stringify({
    name: row.name,
    set_name: row.set_name,
    set_id: row.set_id,
    number: row.number,
    rarity: row.rarity,
    image_url: row.image_url,
    price_usd: row.price_usd,
    price_source: row.price_source,
    price_variant: row.price_variant,
  });
}

async function fetchBulkMetadata() {
  const response = await fetch("https://api.scryfall.com/bulk-data", {
    headers: {
      Accept: "application/json",
      "User-Agent": "DojoTCG/0.0.1",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Scryfall bulk metadata failed: ${response.status} ${errorText}`);
  }

  const body = await response.json();
  const bulk = body.data?.find((item) => item.type === bulkType);

  if (!bulk?.download_uri) {
    throw new Error(`Could not find Scryfall bulk type ${bulkType}.`);
  }

  return bulk;
}

async function downloadBulkFile(downloadUri) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "dojotcg-scryfall-"));
  const filePath = path.join(tempDir, `${bulkType}.json`);
  const response = await fetch(downloadUri, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DojoTCG/0.0.1",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Scryfall bulk download failed: ${response.status} ${errorText}`);
  }

  await pipeline(response.body, createWriteStream(filePath));

  return {
    tempDir,
    filePath,
  };
}

async function loadExistingMtgSignatures() {
  const signatures = new Map();

  for (let from = 0; ; from += existingPageSize) {
    const to = from + existingPageSize - 1;
    const { data, error } = await supabase
      .from("cards")
      .select("external_id,name,set_name,set_id,number,rarity,image_url,price_usd,price_source,price_variant,price_updated_at")
      .eq("game", "mtg")
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      signatures.set(row.external_id, getRowSignature(row));
    }

    if (data.length < existingPageSize) break;
  }

  return signatures;
}

async function upsertRows(rows) {
  if (rows.length === 0 || dryRun) return;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from("cards").upsert(batch, {
      onConflict: "external_id",
    });

    if (error) throw error;
  }
}

async function parseBulkCards(filePath, onCard) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let parsed = 0;

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (depth === 0) {
        if (char === "{") {
          buffer = "{";
          depth = 1;
        }

        continue;
      }

      buffer += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          parsed += 1;
          await onCard(JSON.parse(buffer), parsed);
          buffer = "";
        }
      }
    }
  }

  return parsed;
}

async function printSyncSummary() {
  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("game", "mtg");

  if (error) {
    console.warn("Could not read MTG card count after sync.", error);
    return;
  }

  const { data, error: sampleError } = await supabase
    .from("cards")
    .select("external_id,name,set_name,number,rarity,price_usd,price_variant")
    .eq("game", "mtg")
    .order("updated_at", { ascending: false })
    .limit(5);

  console.info(`Supabase now has ${count} MTG cards.`);

  if (sampleError) {
    console.warn("Could not read MTG card sample after sync.", sampleError);
  } else {
    console.table(data);
  }
}

async function syncMtgCards() {
  let tempDir = null;

  try {
    const bulk = await fetchBulkMetadata();
    console.info(`Downloading Scryfall ${bulk.type} bulk updated at ${bulk.updated_at}.`);
    const download = await downloadBulkFile(bulk.download_uri);
    tempDir = download.tempDir;

    console.info(`Downloaded Scryfall bulk data to ${download.filePath}.`);
    const existingSignatures = await loadExistingMtgSignatures();
    const changedRows = [];
    const dryRunSamples = [];
    let changedCount = 0;
    let parsedCount = 0;

    try {
      parsedCount = await parseBulkCards(download.filePath, async (card, count) => {
        if (maxCards > 0 && count > maxCards) throw new StopParsing();

        const row = normalizeCard(card);
        const existingSignature = existingSignatures.get(row.external_id);

        if (existingSignature !== getRowSignature(row)) {
          changedRows.push(row);
          changedCount += 1;

          if (dryRunSamples.length < 10) {
            dryRunSamples.push(row);
          }
        }

        if (changedRows.length >= batchSize) {
          await upsertRows(changedRows);
          changedRows.length = 0;
        }

        if (count % 10000 === 0) {
          console.info(`Parsed ${count} MTG cards. ${changedCount} rows are new or changed so far.`);
        }
      });
    } catch (error) {
      if (!(error instanceof StopParsing)) {
        throw error;
      }

      parsedCount = maxCards;
    }

    const effectiveParsedCount = maxCards > 0 ? Math.min(parsedCount, maxCards) : parsedCount;

    console.info(`Parsed ${effectiveParsedCount} MTG cards.`);
    console.info(`${changedCount} MTG rows are new or changed.`);

    if (dryRun) {
      console.table(dryRunSamples.map((row) => ({
        external_id: row.external_id,
        name: row.name,
        set_name: row.set_name,
        number: row.number,
        price_usd: row.price_usd,
      })));
      return;
    }

    await upsertRows(changedRows);
    await printSyncSummary();
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      console.info(`Deleted temporary Scryfall bulk directory ${tempDir}.`);
    }
  }
}

syncMtgCards().catch((error) => {
  console.error(error);
  process.exit(1);
});
