-- 0015_drop_engine_hardening.sql
-- Ekstra hardening for drop-engine etter 0007:
-- - Triggerdrevet statusoppdatering + audit på drops
-- - Forbedret process_drop_status_transitions (inkl. sold_out)
-- - Forbedret get_drop_stats med sold_total + estimated_sold_out_at
-- - release_expired_reservations logger hver utløpt ordre til audit_log

-- ---------------------------------------------------------------------
-- Trigger: evaluer status ved writes på drops
-- ---------------------------------------------------------------------
create or replace function public.tg_eval_drop_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prioritet: closed > sold_out > live > scheduled
  if new.ends_at <= now() then
    new.status := 'closed';
  elsif new.units_sold >= new.total_units then
    new.status := 'sold_out';
  elsif new.starts_at <= now() and new.ends_at > now() and new.status = 'scheduled' then
    new.status := 'live';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.audit_log (action, entity_type, entity_id, metadata)
    values (
      'drop.status.transition',
      'drop',
      new.id,
      jsonb_build_object(
        'previous_status', old.status,
        'next_status', new.status,
        'source', 'trigger'
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists drops_eval_status on public.drops;
create trigger drops_eval_status
before insert or update of starts_at, ends_at, units_sold, total_units, status
on public.drops
for each row
execute function public.tg_eval_drop_status();

-- ---------------------------------------------------------------------
-- Cron-funksjon: mer robust statusprosessering
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
  -- scheduled -> live
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
      jsonb_build_object('previous_status', 'scheduled', 'source', 'cron')
    );
    v_count := v_count + 1;
  end loop;

  -- live -> sold_out (hvis teller nådde maks)
  for v_drop in
    select * from public.drops
    where status = 'live'
      and units_sold >= total_units
    for update skip locked
  loop
    update public.drops set status = 'sold_out' where id = v_drop.id;
    insert into public.audit_log (action, entity_type, entity_id, metadata)
    values (
      'drop.status.sold_out',
      'drop',
      v_drop.id,
      jsonb_build_object('previous_status', 'live', 'source', 'cron')
    );
    v_count := v_count + 1;
  end loop;

  -- live/sold_out -> closed
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
      jsonb_build_object('previous_status', v_drop.status, 'source', 'cron')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- get_drop_stats: legg til sold_total + estimated_sold_out_at
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
  v_rate_per_min numeric;
  v_eta timestamptz;
begin
  select * into v_drop from public.drops where id = p_drop_id;
  if not found then
    return jsonb_build_object('error', 'drop_not_found');
  end if;

  v_units_left := greatest(0, v_drop.total_units - v_drop.units_sold);
  v_sold_total := v_drop.units_sold;

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

  select min(paid_at) into v_first_paid_at
  from public.orders
  where drop_id = p_drop_id
    and status in ('paid','confirmed','picked_up');

  if v_first_paid_at is not null then
    v_minutes_since_first_sale := extract(epoch from (now() - v_first_paid_at)) / 60.0;
  else
    v_minutes_since_first_sale := 0;
  end if;

  if v_units_left = 0 then
    v_velocity := 'sold_out';
  elsif v_sold_5min >= 5 then
    v_velocity := 'hot';
  elsif v_sold_5min >= 1 then
    v_velocity := 'warm';
  else
    v_velocity := 'cold';
  end if;

  v_eta := null;
  if v_units_left > 0 and v_minutes_since_first_sale > 0 and v_sold_total > 0 then
    v_rate_per_min := v_sold_total / v_minutes_since_first_sale;
    if v_rate_per_min > 0 then
      v_eta := now() + make_interval(secs => ceil((v_units_left / v_rate_per_min) * 60)::int);
    end if;
  end if;

  return jsonb_build_object(
    'drop_id', p_drop_id,
    'status', v_drop.status,
    'total_units', v_drop.total_units,
    'units_sold', v_drop.units_sold,
    'units_left', v_units_left,
    'sold_last_5min', v_sold_5min,
    'sold_last_15min', v_sold_15min,
    'sold_total', v_sold_total,
    'velocity_label', v_velocity,
    'first_paid_at', v_first_paid_at,
    'minutes_since_first_sale',
      case when v_minutes_since_first_sale > 0
           then round(v_minutes_since_first_sale, 1)
           else null end,
    'estimated_sold_out_at', v_eta,
    'computed_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- release_expired_reservations: legg til audit-log per ordre
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

    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      v_order.user_id,
      'order.reservation_expired',
      'order',
      v_order.id,
      jsonb_build_object(
        'drop_id', v_order.drop_id,
        'pickup_window_id', v_order.pickup_window_id,
        'pickup_slot_id', v_order.pickup_slot_id,
        'released_items_qty', v_total_qty
      )
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
