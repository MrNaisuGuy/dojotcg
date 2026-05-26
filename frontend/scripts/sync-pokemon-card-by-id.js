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
const rowId = process.argv[2];

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!rowId) {
  console.error("Usage: npm run sync:pokemon:card -- <cards.id>");
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
    ...getBestPokemonPrice(card),
    source: "pokemontcg.io",
    raw: card,
    updated_at: new Date().toISOString(),
  };
}

async function fetchPokemonCard(externalId) {
  const headers = {};

  if (pokemonApiKey) {
    headers["X-Api-Key"] = pokemonApiKey;
  }

  const response = await fetch(`https://api.pokemontcg.io/v2/cards/${externalId}`, {
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PokemonTCG card sync failed: ${response.status} ${errorText}`);
  }

  const body = await response.json();
  return body.data;
}

async function syncPokemonCardById() {
  const { data: existingCard, error: readError } = await supabase
    .from("cards")
    .select("id,external_id,name")
    .eq("id", rowId)
    .single();

  if (readError) throw readError;
  if (!existingCard?.external_id) {
    throw new Error(`Card ${rowId} does not have an external_id to sync from PokemonTCG.`);
  }

  const pokemonCard = await fetchPokemonCard(existingCard.external_id);
  const update = normalizeCard(pokemonCard);
  const { error: updateError } = await supabase
    .from("cards")
    .update(update)
    .eq("id", rowId);

  if (updateError) throw updateError;

  console.info("Synced Pokemon card", {
    id: rowId,
    external_id: update.external_id,
    name: update.name,
    number: update.number,
    price_usd: update.price_usd,
    price_variant: update.price_variant,
    price_updated_at: update.price_updated_at,
  });
}

syncPokemonCardById().catch((error) => {
  console.error(error);
  process.exit(1);
});
