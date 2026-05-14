-- =====================================================================
-- reserve_order_capacity.sql
-- Verifiserer at reserve_order:
--   - Tillater nøyaktig N reservasjoner når kapasitet = N
--   - Avviser N+1-te reservasjon med insufficient_units
--   - Holder units_sold konsistent etter alle vellykkede reservasjoner
-- =====================================================================
begin;
select plan(7);

-- =========================================================
-- Setup
-- =========================================================
do $$
declare
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111';
  v_drop_item_id uuid := '22222222-2222-2222-2222-222222222222';
  v_product_id uuid := '33333333-3333-3333-3333-333333333333';
  v_node_id uuid := '44444444-4444-4444-4444-444444444444';
  v_window_id uuid := '55555555-5555-5555-5555-555555555555';
  v_now timestamptz := now();
begin
  insert into public.products (id, slug, name, category, base_price_ore)
    values (v_product_id, 'test-cap', 'Test cap', 'hero', 39600);

  insert into public.drops (id, name, slug, status, starts_at, ends_at, total_units, hype_copy)
    values (v_drop_id, 'Test cap', 'test-cap', 'live', v_now - interval '1 hour', v_now + interval '1 hour', 10, 'Test');

  insert into public.drop_items (id, drop_id, product_id, role, price_ore, available_units)
    values (v_drop_item_id, v_drop_id, v_product_id, 'hero', 39600, 10);

  insert into public.pickup_nodes (id, name, type)
    values (v_node_id, 'Test node', 'own_stop');

  insert into public.pickup_windows (id, drop_id, node_id, starts_at, ends_at, cutoff_at, status)
    values (v_window_id, v_drop_id, v_node_id,
            v_now + interval '2 hours',
            v_now + interval '3 hours',
            v_now + interval '1 hour',
            'open');
end $$;

-- =========================================================
-- Test 1: 10 sekvensielle reservasjoner skal alle lykkes
-- =========================================================
do $$
declare
  v_user uuid;
  v_slot uuid;
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111';
  v_drop_item_id uuid := '22222222-2222-2222-2222-222222222222';
  v_window_id uuid := '55555555-5555-5555-5555-555555555555';
  v_order_id uuid;
  i int;
begin
  -- Velg første slot på vinduet
  select id into v_slot from public.pickup_slots where window_id = v_window_id order by starts_at limit 1;

  for i in 1..10 loop
    -- Lag en ny test-bruker per ordre (slot.max_customers = 10 er nok)
    insert into auth.users (id, email, created_at, updated_at, instance_id, aud, role)
    values (
      gen_random_uuid(),
      'cap-test-' || i || '@test.local',
      now(), now(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated'
    )
    returning id into v_user;

    insert into public.profiles (id, email) values (v_user, 'cap-test-' || i || '@test.local')
    on conflict do nothing;

    v_order_id := public.reserve_order(
      v_user, v_drop_id, v_slot,
      jsonb_build_array(jsonb_build_object('drop_item_id', v_drop_item_id, 'quantity', 1)),
      0, 600, 0
    );
    if v_order_id is null then
      raise exception 'Iteration % returnerte null', i;
    end if;
  end loop;
end $$;

-- Test 1a: 10 ordrer ble opprettet med status='reserved'
select is(
  (select count(*)::int from public.orders where drop_id = '11111111-1111-1111-1111-111111111111' and status = 'reserved'),
  10,
  '10 ordrer reservert etter 10 vellykkede kall'
);

-- Test 1b: drop.units_sold = 10
select is(
  (select units_sold from public.drops where id = '11111111-1111-1111-1111-111111111111'),
  10,
  'units_sold = 10 etter 10 reservasjoner'
);

-- Test 1c: drop_item.sold_units = 10
select is(
  (select sold_units from public.drop_items where id = '22222222-2222-2222-2222-222222222222'),
  10,
  'drop_item.sold_units = 10'
);

-- Test 1d: drop.status = 'sold_out' siden vi nådde total_units
select is(
  (select status from public.drops where id = '11111111-1111-1111-1111-111111111111'),
  'sold_out',
  'drop.status = sold_out etter 10/10 solgt'
);

-- =========================================================
-- Test 2: 11. reservasjon må feile med drop_not_live
--          (siden status=sold_out, ikke 'live')
-- =========================================================
do $$
declare
  v_user uuid;
  v_slot uuid;
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111';
  v_drop_item_id uuid := '22222222-2222-2222-2222-222222222222';
  v_window_id uuid := '55555555-5555-5555-5555-555555555555';
  v_caught text := null;
begin
  select id into v_slot from public.pickup_slots where window_id = v_window_id order by starts_at limit 1;

  insert into auth.users (id, email, created_at, updated_at, instance_id, aud, role)
  values (gen_random_uuid(), 'cap-test-11@test.local', now(), now(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_user;
  insert into public.profiles (id, email) values (v_user, 'cap-test-11@test.local')
  on conflict do nothing;

  begin
    perform public.reserve_order(
      v_user, v_drop_id, v_slot,
      jsonb_build_array(jsonb_build_object('drop_item_id', v_drop_item_id, 'quantity', 1)),
      0, 600, 0
    );
  exception when others then
    v_caught := SQLERRM;
  end;

  perform set_config('test.caught_error', coalesce(v_caught, ''), false);
end $$;

-- Test 2: Feilmelding inneholder 'drop_not_live'
select like(
  current_setting('test.caught_error'),
  '%drop_not_live%',
  '11. reservasjon avvises med drop_not_live (status=sold_out)'
);

-- =========================================================
-- Test 3: Tving status tilbake til 'live' og sjekk insufficient_units
-- =========================================================
update public.drops set status = 'live' where id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_user uuid;
  v_slot uuid;
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111';
  v_drop_item_id uuid := '22222222-2222-2222-2222-222222222222';
  v_window_id uuid := '55555555-5555-5555-5555-555555555555';
  v_caught text := null;
begin
  select id into v_slot from public.pickup_slots where window_id = v_window_id order by starts_at limit 1;

  insert into auth.users (id, email, created_at, updated_at, instance_id, aud, role)
  values (gen_random_uuid(), 'cap-test-12@test.local', now(), now(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  returning id into v_user;
  insert into public.profiles (id, email) values (v_user, 'cap-test-12@test.local')
  on conflict do nothing;

  begin
    perform public.reserve_order(
      v_user, v_drop_id, v_slot,
      jsonb_build_array(jsonb_build_object('drop_item_id', v_drop_item_id, 'quantity', 1)),
      0, 600, 0
    );
  exception when others then
    v_caught := SQLERRM;
  end;

  perform set_config('test.caught_error_2', coalesce(v_caught, ''), false);
end $$;

select like(
  current_setting('test.caught_error_2'),
  '%insufficient_units%',
  '12. reservasjon avvises med insufficient_units når sold_units = available_units'
);

-- =========================================================
-- Test 4: process_drop_status_transitions endrer scheduled → live
-- =========================================================
do $$
declare
  v_drop_id uuid := '66666666-6666-6666-6666-666666666666';
begin
  insert into public.drops (id, name, slug, status, starts_at, ends_at, total_units, hype_copy)
    values (v_drop_id, 'Status test', 'status-test', 'scheduled',
            now() - interval '1 minute', now() + interval '2 hours', 5, 'Test');

  perform public.process_drop_status_transitions();
end $$;

select is(
  (select status from public.drops where id = '66666666-6666-6666-6666-666666666666'),
  'live',
  'process_drop_status_transitions: scheduled → live når starts_at <= now()'
);

-- =========================================================
-- Test 5: get_drop_stats returnerer riktig form
-- =========================================================
select ok(
  (public.get_drop_stats('66666666-6666-6666-6666-666666666666') ? 'units_left'),
  'get_drop_stats returnerer units_left'
);

select ok(
  (public.get_drop_stats('66666666-6666-6666-6666-666666666666') ? 'velocity_label'),
  'get_drop_stats returnerer velocity_label'
);

select * from finish();
rollback;
