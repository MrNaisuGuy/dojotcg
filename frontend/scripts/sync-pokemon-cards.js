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
const pokemonApiKey = process.env.POKEMONTCG_API_KEY;
const pageSize = Number(process.env.POKEMON_SYNC_PAGE_SIZE || 250);
const maxPages = Number(process.env.POKEMON_SYNC_MAX_PAGES || 0);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function getBestPokemonPrice(card) {
  const priceEntries = Object.entries(card.tcgplayer?.prices || {});
  const marketEntry =
    priceEntries.find(([, price]) => typeof price.market === "number") ||
    priceEntries.find(([, price]) => typeof price.mid === "number") ||
    priceEntries.find(([, price]) => typeof price.low === "number");

  if (!marketEntry) {
    return {
      price_usd: null,
      price_source: null,
      price_variant: null,
      price_updated_at: null,
    };
  }

  const [variant, price] = marketEntry;

  return {
    price_usd: price.market ?? price.mid ?? price.low ?? null,
    price_source: "tcgplayer",
    price_variant: variant,
    price_updated_at: card.tcgplayer?.updatedAt || null,
  };
}

function normalizeCard(card) {
  const priceData = getBestPokemonPrice(card);

  return {
    game: "pokemon",
    external_id: card.id,
    name: card.name,
    set_name: card.set?.name || null,
    set_id: card.set?.id || null,
    number: card.number || null,
    printed_total: card.set?.printedTotal || null,
    rarity: card.rarity || null,
    image_url: card.images?.large || card.images?.small || null,
    ...priceData,
    source: "pokemontcg.io",
    raw: card,
    updated_at: new Date().toISOString(),
  };
}

async function fetchPokemonPage(page) {
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    orderBy: "set.releaseDate,number",
    select: [
      "id",
      "name",
      "number",
      "rarity",
      "set",
      "images",
      "tcgplayer",
      "cardmarket",
    ].join(","),
  });
  const headers = {};

  if (pokemonApiKey) {
    headers["X-Api-Key"] = pokemonApiKey;
  }

  const response = await fetch(`https://api.pokemontcg.io/v2/cards?${searchParams}`, {
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PokemonTCG sync failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function upsertCards(cards) {
  const rows = cards.map(normalizeCard);
  const { error } = await supabase.from("cards").upsert(rows, {
    onConflict: "external_id",
  });

  if (error) {
    throw error;
  }
}

async function printSyncSummary() {
  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("game", "pokemon");

  if (error) {
    console.warn("Could not read Pokemon card count after sync.", error);
    return;
  }

  const { data, error: sampleError } = await supabase
    .from("cards")
    .select("external_id,name,set_name,number,printed_total,price_usd,price_variant")
    .eq("game", "pokemon")
    .order("created_at", { ascending: false })
    .limit(3);

  console.info(`Supabase now has ${count} Pokemon cards.`);

  if (sampleError) {
    console.warn("Could not read Pokemon card sample after sync.", sampleError);
  } else {
    console.table(data);
  }
}

async function syncPokemonCards() {
  let page = 1;
  let totalSynced = 0;
  let totalCount = null;

  while (true) {
    const body = await fetchPokemonPage(page);
    const cards = Array.isArray(body.data) ? body.data : [];
    totalCount = body.totalCount ?? totalCount;

    if (cards.length === 0) break;

    await upsertCards(cards);
    totalSynced += cards.length;

    console.info(`Synced Pokemon page ${page}: ${cards.length} cards (${totalSynced}/${totalCount || "?"})`);

    if (maxPages > 0 && page >= maxPages) break;
    if (totalCount && totalSynced >= totalCount) break;

    page += 1;
  }

  console.info(`Pokemon sync complete: ${totalSynced} cards.`);
  await printSyncSummary();
}

syncPokemonCards().catch((error) => {
  console.error(error);
  process.exit(1);
});
