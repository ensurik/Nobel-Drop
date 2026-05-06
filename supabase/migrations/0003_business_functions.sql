-- =====================================================================
-- Forretningsfunksjoner som kalles fra edge functions med service_role.
-- Alle bruker SECURITY DEFINER og er SQL-atomiske (bruker FOR UPDATE).
-- =====================================================================

-- ---------------------------------------------------------------------
-- reserve_order
-- Reserverer units og pickup-slot. Returnerer order_id eller raiser.
-- p_items er JSON-array: [{"drop_item_id":"uuid","quantity":int}]
-- ---------------------------------------------------------------------
create or replace function public.reserve_order(
  p_user_id uuid,
  p_drop_id uuid,
  p_pickup_slot_id uuid,
  p_items jsonb,
  p_credit_to_apply_ore bigint default 0,
  p_reservation_ttl_seconds int default 20,
  p_min_subtotal_ore bigint default 39600  -- 396 kr default minimum
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
begin
  -- 1. Lås drop
  select * into v_drop from public.drops where id = p_drop_id for update;
  if not found then raise exception 'drop_not_found'; end if;
  if v_drop.status not in ('live') then
    raise exception 'drop_not_live status=%', v_drop.status;
  end if;
  if now() < v_drop.starts_at or now() > v_drop.ends_at then
    raise exception 'drop_outside_window';
  end if;

  -- 2. Lås pickup-slot + window
  select * into v_slot from public.pickup_slots
    where id = p_pickup_slot_id for update;
  if not found then raise exception 'slot_not_found'; end if;
  if v_slot.reserved_count >= v_slot.max_customers then
    raise exception 'slot_full';
  end if;

  select * into v_window from public.pickup_windows
    where id = v_slot.window_id for update;
  if v_window.drop_id <> p_drop_id then
    raise exception 'slot_drop_mismatch';
  end if;
  if v_window.status not in ('open') then
    raise exception 'window_not_open status=%', v_window.status;
  end if;

  -- 3. Opprett ordre
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

  -- 4. Iterer items, lås drop_items, dekrementer
  for v_item in
    select (e->>'drop_item_id')::uuid as drop_item_id, (e->>'quantity')::int as quantity
    from jsonb_array_elements(p_items) e
  loop
    if v_item.quantity <= 0 then raise exception 'invalid_quantity'; end if;

    select * into v_drop_item from public.drop_items
      where id = v_item.drop_item_id and drop_id = p_drop_id for update;
    if not found then
      raise exception 'drop_item_not_found id=%', v_item.drop_item_id;
    end if;
    if v_drop_item.available_units - v_drop_item.sold_units < v_item.quantity then
      raise exception 'insufficient_units item=% requested=% remaining=%',
        v_drop_item.id, v_item.quantity,
        v_drop_item.available_units - v_drop_item.sold_units;
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

  -- 5. Sjekk minimum
  if v_subtotal_ore < p_min_subtotal_ore then
    raise exception 'below_minimum subtotal=% min=%', v_subtotal_ore, p_min_subtotal_ore;
  end if;

  -- 6. Inkrementer drop + window + slot
  update public.drops
    set units_sold = units_sold + v_total_qty
    where id = p_drop_id;

  -- Marker drop som sold_out om vi nådde
  update public.drops
    set status = 'sold_out'
    where id = p_drop_id and units_sold >= total_units;

  update public.pickup_windows
    set reserved_count = reserved_count + 1
    where id = v_window.id;

  update public.pickup_slots
    set reserved_count = reserved_count + 1
    where id = p_pickup_slot_id;

  -- 7. Anvend kreditt
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

  -- 8. Oppdater ordre med totals
  update public.orders set
    subtotal_ore = v_subtotal_ore,
    credit_applied_ore = v_credit_to_apply,
    total_ore = v_subtotal_ore - v_credit_to_apply
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- confirm_order_paid
-- Markerer ordre som betalt, genererer pickup-token, bokfører Nobel-kreditt
-- ---------------------------------------------------------------------
create or replace function public.confirm_order_paid(
  p_order_id uuid,
  p_provider text,
  p_provider_intent_id text default null,
  p_pickup_qr_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_credit_pct numeric := 0;
  v_credit_earned bigint := 0;
  v_existing_balance bigint;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'paid' or v_order.status = 'confirmed' or v_order.status = 'picked_up' then
    return;  -- idempotent
  end if;
  if v_order.status <> 'reserved' then
    raise exception 'invalid_status status=%', v_order.status;
  end if;

  -- Tier-logikk basert på subtotal (før kreditt-bruk)
  if v_order.subtotal_ore >= 200000 then       -- 2000 kr
    v_credit_pct := 0.20;
  elsif v_order.subtotal_ore >= 150000 then    -- 1500 kr
    v_credit_pct := 0.15;
  elsif v_order.subtotal_ore >= 100000 then    -- 1000 kr
    v_credit_pct := 0.10;
  end if;

  v_credit_earned := floor(v_order.subtotal_ore * v_credit_pct)::bigint;

  update public.orders set
    status = 'paid',
    payment_provider = p_provider,
    pickup_qr_token = p_pickup_qr_token,
    paid_at = now()
  where id = p_order_id;

  if v_credit_earned > 0 then
    select balance_ore into v_existing_balance
      from public.user_credit_balances where user_id = v_order.user_id;
    v_existing_balance := coalesce(v_existing_balance, 0);

    insert into public.credits_ledger (
      user_id, order_id, type, amount_ore,
      balance_after_ore, expires_at, note
    ) values (
      v_order.user_id, p_order_id, 'earned', v_credit_earned,
      v_existing_balance + v_credit_earned,
      now() + interval '90 days',
      format('Bonus: %s%% av ordre %s', (v_credit_pct*100)::int, p_order_id)
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_order.user_id, 'order.paid', 'order', p_order_id,
    jsonb_build_object('provider', p_provider, 'intent', p_provider_intent_id,
                       'credit_earned_ore', v_credit_earned)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- release_expired_reservations
-- Frigjør units fra ikke-betalte ordrer hvis reservasjon er utgått.
-- ---------------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_total_qty int;
  v_count int := 0;
begin
  for v_order in
    select * from public.orders
    where status = 'reserved'
      and reservation_expires_at < now()
    for update skip locked
  loop
    v_total_qty := 0;
    for v_item in
      select * from public.order_items where order_id = v_order.id
    loop
      if v_item.drop_item_id is not null then
        update public.drop_items
          set sold_units = greatest(0, sold_units - v_item.quantity)
          where id = v_item.drop_item_id;
      end if;
      v_total_qty := v_total_qty + v_item.quantity;
    end loop;

    if v_order.drop_id is not null then
      update public.drops
        set units_sold = greatest(0, units_sold - v_total_qty),
            status = case when status = 'sold_out' then 'live' else status end
        where id = v_order.drop_id;
    end if;

    if v_order.pickup_window_id is not null then
      update public.pickup_windows
        set reserved_count = greatest(0, reserved_count - 1)
        where id = v_order.pickup_window_id;
    end if;
    if v_order.pickup_slot_id is not null then
      update public.pickup_slots
        set reserved_count = greatest(0, reserved_count - 1)
        where id = v_order.pickup_slot_id;
    end if;

    -- Reverser ev. brukt kreditt
    if v_order.credit_applied_ore > 0 then
      insert into public.credits_ledger (user_id, order_id, type, amount_ore,
        balance_after_ore, note)
      select v_order.user_id, v_order.id, 'refund',
             v_order.credit_applied_ore,
             coalesce((select balance_ore from public.user_credit_balances
                       where user_id = v_order.user_id), 0)
             + v_order.credit_applied_ore,
             'Reservasjon utløpt';
    end if;

    update public.orders
      set status = 'cancelled',
          refund_reason = 'reservation_expired'
      where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- evaluate_pickup_window
-- Sjekker om vinduet har nok ordre. Hvis under min ved cutoff:
-- markerer som cancelled_refund og returnerer ordre-id-er som skal refunderes.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_pickup_window(p_window_id uuid)
returns table(action text, order_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window record;
  v_paid_count int;
  v_orders uuid[];
begin
  select * into v_window from public.pickup_windows
    where id = p_window_id for update;
  if not found then raise exception 'window_not_found'; end if;

  if v_window.status not in ('open','locked') then
    return query select 'noop'::text, array[]::uuid[];
    return;
  end if;

  if now() < v_window.cutoff_at then
    return query select 'too_early'::text, array[]::uuid[];
    return;
  end if;

  -- Tell betalte ordrer
  select count(*) into v_paid_count
  from public.orders
  where pickup_window_id = p_window_id
    and status in ('paid','confirmed');

  if v_paid_count >= v_window.min_volume_required then
    update public.pickup_windows
      set status = 'confirmed'
      where id = p_window_id;

    update public.orders
      set status = 'confirmed'
      where pickup_window_id = p_window_id and status = 'paid';

    return query select 'confirmed'::text, array[]::uuid[];
    return;
  else
    -- Refund alle betalte ordrer på dette vinduet
    select array_agg(id) into v_orders
    from public.orders
    where pickup_window_id = p_window_id
      and status in ('paid','reserved');

    update public.pickup_windows
      set status = 'cancelled_refund'
      where id = p_window_id;

    update public.orders
      set status = 'refunded',
          refunded_at = now(),
          refund_reason = 'window_min_volume_not_met'
      where pickup_window_id = p_window_id
        and status in ('paid','reserved');

    insert into public.audit_log (action, entity_type, entity_id, metadata)
    values ('pickup_window.cancelled', 'pickup_window', p_window_id,
            jsonb_build_object('orders_refunded', coalesce(array_length(v_orders,1),0)));

    return query select 'refunded'::text, coalesce(v_orders, array[]::uuid[]);
    return;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- mark_order_picked_up
-- Driver kaller via verify-pickup edge function.
-- ---------------------------------------------------------------------
create or replace function public.mark_order_picked_up(
  p_order_id uuid,
  p_driver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('paid','confirmed') then
    raise exception 'invalid_status status=%', v_order.status;
  end if;

  update public.orders set
    status = 'picked_up',
    picked_up_at = now(),
    picked_up_by = p_driver_id
  where id = p_order_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (p_driver_id, 'order.picked_up', 'order', p_order_id);
end;
$$;

-- ---------------------------------------------------------------------
-- generate_pickup_window_grid
-- Hjelpefunksjon: lager 30-min slots for en window.
-- ---------------------------------------------------------------------
create or replace function public.generate_pickup_slots_for_window(p_window_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window record;
  v_count int := 0;
  v_t timestamptz;
begin
  select * into v_window from public.pickup_windows where id = p_window_id;
  if not found then raise exception 'window_not_found'; end if;

  v_t := v_window.starts_at;
  while v_t < v_window.ends_at loop
    insert into public.pickup_slots (window_id, starts_at, ends_at)
    values (p_window_id, v_t, v_t + interval '30 minutes')
    on conflict do nothing;
    v_t := v_t + interval '30 minutes';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Trigger: auto-generer slots når et vindu opprettes
create or replace function public.tg_auto_generate_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_pickup_slots_for_window(new.id);
  return new;
end;
$$;

create trigger pickup_windows_auto_slots
  after insert on public.pickup_windows
  for each row execute function public.tg_auto_generate_slots();
