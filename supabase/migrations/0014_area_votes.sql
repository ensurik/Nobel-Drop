-- 0014_area_votes.sql
-- Datamodell for "Stem frem ditt område".
-- Kun service_role skal kunne INSERT/SELECT fullt; admin kan SELECT via RLS.

create table if not exists public.area_votes (
  id uuid primary key default gen_random_uuid(),
  area_input text not null,
  normalized_area text,
  lat numeric(9,6),
  lng numeric(9,6),
  email text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists area_votes_normalized
  on public.area_votes(normalized_area);

create index if not exists area_votes_created
  on public.area_votes(created_at desc);

alter table public.area_votes enable row level security;

-- Admin får lese (for heatmap/oversikt).
create policy area_votes_admin_select on public.area_votes
  for select using (public.is_admin());

comment on table public.area_votes is
  'Stemmer fra marketing-skjema. Input lagres rått og (senere) normalisert via geocoding.';
