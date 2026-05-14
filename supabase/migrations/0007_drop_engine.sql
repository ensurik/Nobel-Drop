-- =====================================================================
-- 0007_drop_engine.sql
-- Hardener drop-engine:
--   1. reserve_order låser drop_items i deterministisk UUID-rekkefølge
--      (hindrer deadlock mellom samtidige kall med items i ulik rekkefølge)
--   2. process_drop_status_transitions() — kjøres av cron, håndterer
--      scheduled→live, live→closed transisjoner
--   3. get_drop_stats(drop_id) — live-stats med velocity-label
-- =====================================================================

-- ---------------------------------------------------------------------
-- reserve_order — race-hardenet
-- ---------------------------------------------------------------------
create or replace function public.reserve_order(
  p_user_id uuid,
  p_drop_id uuid,
  p_pickup_slot_id uuid,
  p_items jsonb,
  p_credit_to_apply_ore bigint default 0,
  p_reservation_ttl_seconds int default 20,
  p_min_subtotal_ore bigint default 39600
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_drop record;
  v_slot record;
  v_window record;
  v_item record;
  v_drop_item record;
  v_subtotal_ore bigint := 0;
  v_total_qty int := 0;
  v_user_balance bigint;
  v_credit_to_apply bigint;
  v_drop_item_ids uuid[];
begin
  -- ====== LÅSREKKEFØLGE (kritisk for å unngå deadlocks) ======
  -- 1. drops              (én rad)
  -- 2. pickup_slots       (én rad)
  -- 3. pickup_windows     (én rad)
  -- 4. drop_items         (flere rader, ALLTID sortert på id)
  -- ============================================================

  -- 1. Lås drop
  select * into v_drop from public.drops where id = p_drop_id for update;
  if not found then raise exception 'drop_not_found' using errcode = 'P0001'; end if;
  if v_drop.status not in ('live') then
    raise exception 'drop_not_live status=%', v_drop.status using errcode = 'P0002';
  end if;
  if now() < v_drop.starts_at or now() > v_drop.ends_at then
    raise exception 'drop_outside_window' using errcode = 'P0003';
  end if;

  -- 2. Lås pickup-slot
  select * into v_slot from public.pickup_slots
    where id = p_pickup_slot_id for update;
  if not found then raise exception 'slot_not_found' using errcode = 'P0004'; end if;
  if v_slot.reserved_count >= v_slot.max_customers then
    raise exception 'slot_full' using errcode = 'P0005';
  end if;

  -- 3. Lås pickup-window
  select * into v_window from public.pickup_windows
    where id = v_slot.window_id for update;
  if v_window.drop_id <> p_drop_id then
    raise exception 'slot_drop_mismatch' using errcode = 'P0006';
  end if;
  if v_window.status not in ('open') then
    raise exception 'window_not_open status=%', v_window.status using errcode = 'P0007';
  end if;

  -- 4. PRE-LÅS alle drop_items i sortert UUID-rekkefølge før noen skrivinger.
  -- Dette er låsrekkefølge-disiplinen som gjør reservasjonen deadlock-fri.
  select array_agg((e->>'drop_item_id')::uuid) into v_drop_item_ids
  from jsonb_array_elements(p_items) e;

  if v_drop_item_ids is null or array_length(v_drop_item_ids, 1) = 0 then
    raise exception 'no_items' using errcode = 'P0008';
  end if;

  perform 1 from public.drop_items
    where id = any(v_drop_item_ids) and drop_id = p_drop_id
    order by id  -- deterministisk låserekkefølge — KRITISK
    for update;

  -- 5. Opprett ordre
  insert into public.orders (
    user_id, drop_id, pickup_window_id, pickup_slot_id,
    status, subtotal_ore, credit_applied_ore, total_ore,
    reservation_expires_at
  ) values (
    p_user_id, p_drop_id, v_window.id, p_pickup_slot_id,
    'reserved', 0, 0, 0,
    now() + (p_reservation_ttl_seconds || ' seconds')::interval
  )
  returning id into v_order_id;

  -- 6. Iterer items, valider kapasitet, dekrementer.
  -- Items leses i sortert rekkefølge for at logging skal være deterministisk.
  for v_item in
    select (e->>'drop_item_id')::uuid as drop_item_id,
           (e->>'quantity')::int as quantity
    from jsonb_array_elements(p_items) e
    order by (e->>'drop_item_id')::uuid
  loop
    if v_item.quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = 'P0009';
    end if;

    -- Allerede låst i steg 4, men hent verdier nå (locks er holdt for hele txn)
    select * into v_drop_item from public.drop_items
      where id = v_item.drop_item_id and drop_id = p_drop_id;
    if not found then
      raise exception 'drop_item_not_found id=%', v_item.drop_item_id using errcode = 'P0010';
    end if;
    if v_drop_item.available_units - v_drop_item.sold_units < v_item.quantity then
      raise exception 'insufficient_units item=% requested=% remaining=%',
        v_drop_item.id, v_item.quantity,
        v_drop_item.available_units - v_drop_item.sold_units
        using errcode = 'P0011';
    end if;

    update public.drop_items
      set sold_units = sold_units + v_item.quantity
      where id = v_drop_item.id;

    insert into public.order_items (
      order_id, product_id, drop_item_id, quantity,
      unit_price_ore, line_total_ore
    ) values (
      v_order_id, v_drop_item.product_id, v_drop_item.id, v_item.quantity,
      v_drop_item.price_ore, v_drop_item.price_ore * v_item.quantity
    );

    v_subtotal_ore := v_subtotal_ore + v_drop_item.price_ore * v_item.quantity;
    v_total_qty := v_total_qty + v_item.quantity;
  end loop;

  -- 7. Sjekk minimum
  if v_subtotal_ore < p_min_subtotal_ore then
    raise exception 'below_minimum subtotal=% min=%', v_subtotal_ore, p_min_subtotal_ore
      using errcode = 'P0012';
  end if;

  -- 8. Inkrementer drop + window + slot
  update public.drops
    set units_sold = units_sold + v_total_qty
    where id = p_drop_id;

  update public.drops
    set status = 'sold_out'
    where id = p_drop_id and units_sold >= total_units;

  update public.pickup_windows
    set reserved_count = reserved_count + 1
    where id = v_window.id;

  update public.pickup_slots
    set reserved_count = reserved_count + 1
    where id = p_pickup_slot_id;

  -- 9. Anvend kreditt
  v_credit_to_apply := 0;
  if p_credit_to_apply_ore > 0 then
    select balance_ore into v_user_balance
      from public.user_credit_balances where user_id = p_user_id;
    v_user_balance := coalesce(v_user_balance, 0);
    v_credit_to_apply := least(p_credit_to_apply_ore, v_user_balance, v_subtotal_ore);

    if v_credit_to_apply > 0 then
      insert into public.credits_ledger (
        user_id, order_id, type, amount_ore,
        balance_after_ore, note
      ) values (
        p_user_id, v_order_id, 'spent', -v_credit_to_apply,
        v_user_balance - v_credit_to_apply,
        'Brukt på ordre ' || v_order_id::text
      );
    end if;
  end if;

  -- 10. Oppdater ordre med totals
  update public.orders set
    subtotal_ore = v_subtotal_ore,
    credit_applied_ore = v_credit_to_apply,
    total_ore = v_subtotal_ore - v_credit_to_apply
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- process_drop_status_transitions
-- Kjøres av pg_cron hvert minutt for å håndtere status-overgangene
-- som ikke skjer atomisk i reserve_order.
--   scheduled → live   (når now() >= starts_at)
--   live → closed      (når now() >= ends_at)
-- sold_out → live revertering håndteres allerede av release_expired_reservations.
-- Returnerer antall transisjoner gjort.
-- ---------------------------------------------------------------------
create or replace function public.process_drop_status_transitions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop record;
  v_count int := 0;
begin
  -- scheduled → live
  for v_drop in
    select * from public.drops
    where status = 'scheduled'
      and starts_at <= now()
      and ends_at > now()
    for update skip locked
  loop
    update public.drops set status = 'live' where id = v_drop.id;

    insert into public.audit_log (action, entity_type, entity_id, metadata)
    values (
      'drop.status.live',
      'drop',
      v_drop.id,
      jsonb_build_object('previous_status', 'scheduled', 'starts_at', v_drop.starts_at)
    );
    v_count := v_count + 1;
  end loop;

  -- live → closed (eller sold_out → closed)
  for v_drop in
    select * from public.drops
    where status in ('live', 'sold_out')
      and ends_at <= now()
    for update skip locked
  loop
    update public.drops set status = 'closed' where id = v_drop.id;

    insert into public.audit_log (action, entity_type, entity_id, metadata)
    values (
      'drop.status.closed',
      'drop',
      v_drop.id,
      jsonb_build_object('previous_status', v_drop.status, 'ends_at', v_drop.ends_at)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- get_drop_stats
-- Live-stats for et drop: hva er solgt nå, og hvor varmt går det.
-- Caches lett (SECURITY DEFINER, billig query).
-- velocity_label: 'cold' | 'warm' | 'hot' | 'sold_out'
-- ---------------------------------------------------------------------
create or replace function public.get_drop_stats(p_drop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop record;
  v_units_left int;
  v_sold_total int;
  v_sold_5min int;
  v_sold_15min int;
  v_velocity text;
  v_first_paid_at timestamptz;
  v_minutes_since_first_sale numeric;
begin
  select * into v_drop from public.drops where id = p_drop_id;
  if not found then
    return jsonb_build_object('error', 'drop_not_found');
  end if;

  v_units_left := greatest(0, v_drop.total_units - v_drop.units_sold);
  v_sold_total := v_drop.units_sold;

  -- Telle ordrer som er BETALT (paid/confirmed/picked_up) i siste 5/15 min.
  -- Vi bruker paid_at i stedet for created_at, fordi reservasjon + utløp
  -- ikke skal påvirke velocity-tallet.
  select count(*) into v_sold_5min
  from public.orders
  where drop_id = p_drop_id
    and status in ('paid','confirmed','picked_up')
    and paid_at >= now() - interval '5 minutes';

  select count(*) into v_sold_15min
  from public.orders
  where drop_id = p_drop_id
    and status in ('paid','confirmed','picked_up')
    and paid_at >= now() - interval '15 minutes';

  -- Tid siden første betalte ordre, for å estimere ferdig-tidspunkt
  select min(paid_at) into v_first_paid_at
  from public.orders
  where drop_id = p_drop_id
    and status in ('paid','confirmed','picked_up');

  if v_first_paid_at is not null then
    v_minutes_since_first_sale := extract(epoch from (now() - v_first_paid_at)) / 60.0;
  else
    v_minutes_since_first_sale := 0;
  end if;

  -- Velocity-label
  if v_units_left = 0 then
    v_velocity := 'sold_out';
  elsif v_sold_5min >= 5 then
    v_velocity := 'hot';
  elsif v_sold_5min >= 1 then
    v_velocity := 'warm';
  else
    v_velocity := 'cold';
  end if;

  return jsonb_build_object(
    'drop_id', p_drop_id,
    'status', v_drop.status,
    'total_units', v_drop.total_units,
    'units_sold', v_drop.units_sold,
    'units_left', v_units_left,
    'sold_last_5min', v_sold_5min,
    'sold_last_15min', v_sold_15min,
    'velocity_label', v_velocity,
    'first_paid_at', v_first_paid_at,
    'minutes_since_first_sale',
      case when v_minutes_since_first_sale > 0
           then round(v_minutes_since_first_sale, 1)
           else null end,
    'computed_at', now()
  );
end;
$$;

-- Tillat anonym lesetilgang via RPC (dette er publikt safe — det er aggregate stats).
grant execute on function public.get_drop_stats(uuid) to anon, authenticated;
