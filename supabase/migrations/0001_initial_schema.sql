-- =====================================================================
-- Nobel Drop — Initial schema
-- Penger lagres i øre (NOK × 100). All forretningslogikk antar dette.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- profiles (utvidelse av auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  full_name text,
  role text not null default 'customer'
    check (role in ('customer','admin','driver')),
  marketing_consent boolean default false,
  push_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);

-- Auto-opprett profile ved signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text not null
    check (category in ('hero','addon','main_cake','dinner','seasonal')),
  base_price_ore bigint not null check (base_price_ore >= 0),
  image_url text,
  hero_image_url text,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index products_active_category_idx on public.products(is_active, category);

-- ---------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------
create table public.drops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','live','sold_out','closed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total_units int not null check (total_units > 0),
  units_sold int not null default 0,
  cover_image_url text,
  hype_copy text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (units_sold <= total_units)
);

create index drops_status_starts_idx on public.drops(status, starts_at);

-- ---------------------------------------------------------------------
-- drop_items
-- ---------------------------------------------------------------------
create table public.drop_items (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  product_id uuid not null references public.products(id),
  role text not null check (role in ('hero','addon','order_lifter')),
  price_ore bigint not null check (price_ore >= 0),
  available_units int not null check (available_units >= 0),
  sold_units int not null default 0,
  display_order int default 0,
  unique(drop_id, product_id),
  check (sold_units <= available_units)
);

create index drop_items_drop_idx on public.drop_items(drop_id);

-- ---------------------------------------------------------------------
-- pickup_nodes
-- ---------------------------------------------------------------------
create table public.pickup_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  type text not null check (type in ('own_stop','partner')),
  is_active boolean default true,
  notes text,
  created_at timestamptz not null default now()
);

create index pickup_nodes_active_idx on public.pickup_nodes(is_active);

-- ---------------------------------------------------------------------
-- pickup_windows (90 min stopp)
-- ---------------------------------------------------------------------
create table public.pickup_windows (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  node_id uuid not null references public.pickup_nodes(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  min_volume_required int not null default 0,
  reserved_count int not null default 0,
  status text not null default 'open'
    check (status in ('open','locked','confirmed','cancelled_refund')),
  cutoff_at timestamptz not null,
  driver_id uuid references public.profiles(id),
  unique(drop_id, node_id, starts_at),
  check (ends_at - starts_at = interval '90 minutes')
);

create index pickup_windows_drop_idx on public.pickup_windows(drop_id);
create index pickup_windows_status_idx on public.pickup_windows(status);

-- ---------------------------------------------------------------------
-- pickup_slots (30 min sub-slot, max 10 kunder)
-- ---------------------------------------------------------------------
create table public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references public.pickup_windows(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_customers int not null default 10,
  reserved_count int not null default 0,
  unique(window_id, starts_at),
  check (ends_at - starts_at = interval '30 minutes'),
  check (reserved_count <= max_customers)
);

create index pickup_slots_window_idx on public.pickup_slots(window_id);

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  drop_id uuid references public.drops(id),
  pickup_window_id uuid references public.pickup_windows(id),
  pickup_slot_id uuid references public.pickup_slots(id),
  status text not null default 'pending'
    check (status in
      ('pending','reserved','paid','confirmed','picked_up','refunded','cancelled')),
  subtotal_ore bigint not null check (subtotal_ore >= 0),
  credit_applied_ore bigint not null default 0 check (credit_applied_ore >= 0),
  total_ore bigint not null check (total_ore >= 0),
  currency text not null default 'NOK',
  payment_provider text check (payment_provider in ('vipps','stripe','klarna')),
  pickup_qr_token text unique,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles(id),
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  refund_reason text
);

create index orders_user_idx on public.orders(user_id);
create index orders_drop_idx on public.orders(drop_id);
create index orders_window_idx on public.orders(pickup_window_id);
create index orders_pending_idx on public.orders(status, reservation_expires_at)
  where status in ('pending','reserved');
create index orders_status_idx on public.orders(status);

-- ---------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  drop_item_id uuid references public.drop_items(id),
  quantity int not null check (quantity > 0),
  unit_price_ore bigint not null check (unit_price_ore >= 0),
  line_total_ore bigint not null check (line_total_ore >= 0)
);

create index order_items_order_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------
-- credits_ledger (Nobel-kreditt)
-- ---------------------------------------------------------------------
create table public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  type text not null check (type in
    ('earned','spent','expired','manual_adjust','refund')),
  amount_ore bigint not null,         -- positiv eller negativ
  balance_after_ore bigint not null,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index credits_user_created_idx on public.credits_ledger(user_id, created_at desc);
create index credits_user_active_idx on public.credits_ledger(user_id);

-- View for rask saldo-oppslag
create or replace view public.user_credit_balances as
select
  user_id,
  coalesce(sum(amount_ore), 0)::bigint as balance_ore
from public.credits_ledger
where (expires_at is null or expires_at > now())
group by user_id;

-- ---------------------------------------------------------------------
-- payment_intents
-- ---------------------------------------------------------------------
create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('vipps','stripe','klarna')),
  provider_intent_id text,
  status text not null,
  amount_ore bigint not null,
  currency text not null default 'NOK',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_intents_order_idx on public.payment_intents(order_id);
create unique index payment_intents_provider_id_uidx
  on public.payment_intents(provider, provider_intent_id)
  where provider_intent_id is not null;

-- ---------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('web','ios','android')),
  endpoint text,
  p256dh text,
  auth text,
  expo_token text,
  created_at timestamptz not null default now()
);

create unique index push_unique_endpoint_uidx
  on public.push_subscriptions(user_id, platform, coalesce(endpoint, expo_token));

-- ---------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_action_idx on public.audit_log(action);
create index audit_entity_idx on public.audit_log(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger payment_intents_set_updated_at
  before update on public.payment_intents
  for each row execute function public.set_updated_at();
