alter table public.cards
add constraint cards_external_id_unique unique (external_id);
