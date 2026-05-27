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
const applyChanges = process.env.ONEPIECE_SOURCE_BACKFILL_APPLY === "true";
const pageSize = Number(process.env.ONEPIECE_SOURCE_BACKFILL_PAGE_SIZE || 1000);
const sourceName = "official-bandai-cardlist";

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
    transport: class BackfillDisabledWebSocket {},
  },
});

function isOfficialBandaiRow(card) {
  return String(card.raw?.source_url || "").includes("onepiece-cardgame.com");
}

async function fetchOnePieceCards() {
  const cards = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("cards")
      .select("id,external_id,game,name,number,source,raw")
      .eq("game", "onepiece")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    cards.push(...data);

    if (data.length < pageSize) break;
  }

  return cards;
}

async function backfillOnePieceSource() {
  const cards = await fetchOnePieceCards();
  const officialRows = cards.filter(isOfficialBandaiRow);
  const rowsToUpdate = officialRows.filter((card) => card.source !== sourceName);

  console.info(`Found ${cards.length} One Piece rows.`);
  console.info(`Found ${officialRows.length} rows with official Bandai source URLs.`);
  console.info(`Need to update ${rowsToUpdate.length} rows to source=${sourceName}.`);

  if (rowsToUpdate.length > 0) {
    console.table(rowsToUpdate.slice(0, 10).map((card) => ({
      id: card.id,
      external_id: card.external_id,
      number: card.number,
      name: card.name,
      current_source: card.source,
    })));
  }

  if (!applyChanges) {
    console.info("Dry run only. Set ONEPIECE_SOURCE_BACKFILL_APPLY=true to update rows.");
    return;
  }

  for (const card of rowsToUpdate) {
    const { error } = await supabase
      .from("cards")
      .update({
        source: sourceName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", card.id);

    if (error) throw error;
  }

  console.info(`Updated ${rowsToUpdate.length} rows.`);
}

backfillOnePieceSource().catch((error) => {
  console.error(error);
  process.exit(1);
});
