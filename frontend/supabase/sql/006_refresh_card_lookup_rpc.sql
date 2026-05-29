drop function if exists public.lookup_cards_by_lower_name(text, text[], integer);

create or replace function public.lookup_cards_by_lower_name(
  p_game text,
  p_names text[],
  p_limit integer default 8
)
returns table (
  id text,
  external_id text,
  game text,
  name text,
  set_name text,
  set_id text,
  number text,
  printed_total integer,
  rarity text,
  image_url text,
  price_usd numeric,
  price_variant text,
  price_updated_at text
)
language sql
stable
as $$
  select
    c.id::text,
    c.external_id,
    c.game,
    c.name,
    c.set_name,
    c.set_id,
    c.number,
    c.printed_total::integer,
    c.rarity,
    c.image_url,
    c.price_usd,
    c.price_variant,
    c.price_updated_at::text
  from public.cards c
  where c.game = p_game
    and c.name ilike any (p_names)
  limit p_limit;
$$;
