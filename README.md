# DojoTCG Features

## Current MVP Features

- AI-powered card scanning from uploaded images.
- Mobile camera capture flow.
- Mobile gallery upload flow.
- Desktop image upload flow.
- Client-side image resizing/compression before analysis.
- Swipe-to-analyze interaction on mobile.
- OpenAI vision extraction for card metadata.
- Extracted fields include:
  - Game
  - Card name
  - Local non-English name
  - Romanized name
  - English name guess
  - Collector number
  - Printed total
  - Set code
  - Set name
  - Language
  - Rarity
  - Foil treatment
  - Card type
  - Copyright year
  - Visible text
  - Uncertain fields
- Confidence-based candidate matching.
- Supabase-backed card catalog.
- Pokemon card sync from PokemonTCG into Supabase.
- Supabase-first card lookup for Pokemon identity and images.
- Local card image URLs served from the synced card catalog.
- Candidate images and prices come from the synced Supabase card catalog.
- Candidate match display with match score and match reasons.
- Raw scan result display.

## Rules And Reference Features

- TCG rules/resources page.
- Pokemon TCG resource links.
- Magic: The Gathering resource links.
- One Piece TCG resource links.
- Turn format pages for supported games.
- Player layout diagrams for supported games.
- Mobile scroll reset/navigation fixes for rules subpages.
- Mobile rules resource panel reveal after selecting a game.

## Data And Sync Features

- Supabase client configured for frontend use.
- Server-side Supabase service-role sync script.
- `npm run sync:pokemon` command.
- Limited sync testing with `POKEMON_SYNC_MAX_PAGES`.
- Card catalog fields include:
  - Game
  - External id
  - Name
  - Set id
  - Set name
  - Number
  - Printed total
  - Rarity
  - Image URL
- Unique `external_id` support for card upserts.

## Current Platform

- React/Vite web app.
- Vercel-compatible API route for card analysis.
- Supabase Postgres for card catalog data.
- Mobile-first scan UX with a future path toward Capacitor/native app wrapping.
