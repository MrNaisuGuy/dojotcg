alter table public.cards
add column if not exists price_usd numeric,
add column if not exists price_source text,
add column if not exists price_variant text,
add column if not exists price_updated_at date;
