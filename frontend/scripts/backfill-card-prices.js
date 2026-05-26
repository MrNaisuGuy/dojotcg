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
const pageSize = Number(process.env.PRICE_BACKFILL_PAGE_SIZE || 500);

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

function getBestPokemonPrice(raw) {
  const priceEntries = Object.entries(raw?.tcgplayer?.prices || {});
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
    price_updated_at: raw.tcgplayer?.updatedAt || null,
  };
}

async function updatePriceBatch(rows) {
  for (const row of rows) {
    const { error } = await supabase
      .from("cards")
      .update({
        ...getBestPokemonPrice(row.raw),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) throw error;
  }
}

async function backfillCardPrices() {
  let from = 0;
  let updated = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("cards")
      .select("id,raw")
      .eq("game", "pokemon")
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    await updatePriceBatch(data);
    updated += data.length;

    console.info(`Backfilled price columns for ${updated} cards.`);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.info(`Price backfill complete: ${updated} cards processed.`);
}

backfillCardPrices().catch((error) => {
  console.error(error);
  process.exit(1);
});
