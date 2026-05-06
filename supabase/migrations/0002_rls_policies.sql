-- =====================================================================
-- Row-Level Security policies
-- Skriv-paths som krever invarianter går via edge functions med service_role.
-- =====================================================================

-- Helper: er innlogget bruker admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver'
  );
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
alter table public.products enable row level security;

create policy products_public_select on public.products
  for select using (is_active = true or public.is_admin());

create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------
alter table public.drops enable row level security;

create policy drops_public_select on public.drops
  for select using (
    status in ('scheduled','live','sold_out','closed') or public.is_admin()
  );

create policy drops_admin_write on public.drops
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- drop_items
-- ---------------------------------------------------------------------
alter table public.drop_items enable row level security;

create policy drop_items_public_select on public.drop_items
  for select using (
    exists (
      select 1 from public.drops d
      where d.id = drop_items.drop_id
      and (d.status in ('scheduled','live','sold_out','closed') or public.is_admin())
    )
  );

create policy drop_items_admin_write on public.drop_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- pickup_nodes
-- ---------------------------------------------------------------------
alter table public.pickup_nodes enable row level security;

create policy pickup_nodes_public_select on public.pickup_nodes
  for select using (is_active = true or public.is_admin());

create policy pickup_nodes_admin_write on public.pickup_nodes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- pickup_windows
-- ---------------------------------------------------------------------
alter table public.pickup_windows enable row level security;

create policy pickup_windows_public_select on public.pickup_windows
  for select using (
    exists (
      select 1 from public.drops d
      where d.id = pickup_windows.drop_id
      and (d.status in ('scheduled','live','sold_out') or public.is_admin())
    )
    or public.is_driver()
  );

create policy pickup_windows_admin_write on public.pickup_windows
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- pickup_slots
-- ---------------------------------------------------------------------
alter table public.pickup_slots enable row level security;

create policy pickup_slots_public_select on public.pickup_slots
  for select using (
    exists (
      select 1
      from public.pickup_windows pw
      join public.drops d on d.id = pw.drop_id
      where pw.id = pickup_slots.window_id
      and (d.status in ('scheduled','live','sold_out') or public.is_admin())
    )
    or public.is_driver()
  );

create policy pickup_slots_admin_write on public.pickup_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;

create policy orders_owner_select on public.orders
  for select using (
    auth.uid() = user_id
    or public.is_admin()
    or (
      public.is_driver()
      and pickup_window_id in (
        select id from public.pickup_windows where driver_id = auth.uid()
      )
    )
  );

-- Skrivinger gjøres kun via service_role (edge functions). Ingen direct write-policy.

-- ---------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------
alter table public.order_items enable row level security;

create policy order_items_via_orders on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and (
        o.user_id = auth.uid()
        or public.is_admin()
        or (
          public.is_driver()
          and o.pickup_window_id in (
            select id from public.pickup_windows where driver_id = auth.uid()
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------
-- credits_ledger
-- ---------------------------------------------------------------------
alter table public.credits_ledger enable row level security;

create policy credits_owner_select on public.credits_ledger
  for select using (auth.uid() = user_id or public.is_admin());

-- Ingen direct write — alltid via service_role.

-- ---------------------------------------------------------------------
-- payment_intents
-- ---------------------------------------------------------------------
alter table public.payment_intents enable row level security;

create policy payment_intents_admin_select on public.payment_intents
  for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy push_self_select on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy push_self_insert on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy push_self_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------
alter table public.audit_log enable row level security;

create policy audit_admin_select on public.audit_log
  for select using (public.is_admin());

-- Grants for view
grant select on public.user_credit_balances to authenticated;
