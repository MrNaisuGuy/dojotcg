# DojoTCG Update Notes

## 2026-05-28

OpenAI prompt tightening based on what Supabase already knows:

- Changed the prompt to ask for visible lookup fields only. OpenAI now reads the card like a label, while Supabase does the database matching.
- Removed requests for market price, condition, product ID, database ID, and variant. Those are database/provider facts, so guessing them from an image could create bad matches.
- Made JSON-only output stricter and smaller. This makes the scanner response easier to parse and avoids wasting time on extra text.
- Told OpenAI to prefer exact printed identifiers over names. Card numbers, set codes, and One Piece card IDs are usually better lookup keys than a guessed name.
- Kept confidence scores focused on visual readability. A score now means "how clearly the image showed this," not "how sure the database match is."
- Added clearer Pokemon handling for Japanese and Korean cards. OpenAI keeps the printed local name and only guesses the English name when it can do that confidently.
- Tightened One Piece recognition around the bottom-right card ID. The ID like `OP01-001` or `ST10-003` is the strongest key Supabase can use.
- Tightened MTG recognition around collector number and set code. Those fields are more useful for Scryfall/Supabase matching than rules text.
- Limited `visibleText` to a few useful snippets. This keeps debug context without sending bulky raw OCR-style text through the whole scan response.
- Switched vision detail to `auto` first, with `high` only as a fallback. Small clean images should scan faster, while difficult images still get a second chance.
- Added candidate deduplication for scan results. If the same card is found by multiple lookup paths, the app keeps one copy and remembers the strongest match reason.
- Added a frontend safety check so the best match cannot also appear again as a duplicate candidate card. The results page should now show each matched card only once.

## 2026-05-27 13:16:54 UTC

Tonight was a major data-pipeline pass.

- Tuned One Piece recognition so OpenAI prioritizes the bottom-right card ID first, then card type, then card name.
- Confirmed `cards.number` is the right normalized field for One Piece printed IDs such as `OP02-010`.
- Kept `external_id` variant-safe instead of collapsing it to the printed card number.
- Added official Bandai One Piece card sync as the primary One Piece catalog source.
- Added a one-time backfill script for existing One Piece rows whose raw payload pointed to `onepiece-cardgame.com`.
- Added weekly GitHub Actions workflow for official Bandai One Piece catalog sync.
- Confirmed OPTCG API connectivity works from GitHub Actions even though it times out from the Codespace runtime.
- Added OPTCG enrichment sync for One Piece images and prices using `cards.number`.
- Split OPTCG enrichment into its own GitHub Actions workflow scheduled two hours after the Bandai sync.
- Added OPTCG throttling protections: slower request pacing, max request cap, recent-row skipping, smarter endpoint ordering, and clean stop on HTTP 429.
- Added Scryfall MTG `default_cards` bulk sync.
- Added weekly GitHub Actions workflow for MTG bulk sync.
- Fixed MTG bulk sync to stream-parse Scryfall data instead of reading the whole JSON into memory.
- Ensured Scryfall temporary bulk files are deleted after sync completion or failure.

## 2026-05-26 to 2026-05-27

- Added Supabase-backed card catalog direction for scanner results.
- Added Pokemon card sync from PokemonTCG into the shared `cards` table.
- Added unique `external_id` support for card upserts.
- Added GitHub Actions workflow for Pokemon card sync.
- Moved sync jobs toward weekly schedules rather than daily runs.
- Fixed Supabase realtime transport behavior in Node 20 sync scripts.
- Improved local/Supabase-first card matching so scan-time behavior is less dependent on third-party live lookups.
- Improved matching around card name, card number, printed total, and set identity.

## Earlier MVP Foundation

- Built AI-powered card scanning from uploaded images.
- Added mobile camera/gallery upload and desktop upload flows.
- Added client-side image resizing/compression before analysis.
- Added OpenAI vision extraction for game, card name, local name, romanized name, English guess, collector number, printed total, set, rarity, foil treatment, card type, visible text, and uncertainty fields.
- Added confidence-based candidate matching and match reason display.
- Added raw scan result display for debugging.
- Added TCG rules/resources pages for Pokemon, Magic: The Gathering, and One Piece.
- Added turn format and player layout reference pages.
- Established React/Vite frontend, Vercel-compatible API route, and Supabase Postgres as the core platform.
