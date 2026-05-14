-- =====================================================================
-- reserve_order_race.sql
-- "Race" kapasitetstest: 100 reserve_order-forsøk på et drop med 10 units.
-- Forventer nøyaktig 10 suksesser og 90 insufficient_units/drop_not_live.
-- =====================================================================
begin;
select plan(4);

do $$
declare
  v_drop_id uuid := '71111111-1111-1111-1111-111111111111';
  v_drop_item_id uuid := '72222222-2222-2222-2222-222222222222';
  v_product_id uuid := '73333333-3333-3333-3333-333333333333';
  v_node_id uuid := '74444444-4444-4444-4444-444444444444';
  v_window_id uuid := '75555555-5555-5555-5555-555555555555';
  v_slot_id uuid;
  v_now timestamptz := now();
  v_user uuid;
  v_success int := 0;
  v_fail int := 0;
  v_err text;
  i int;
begin
  insert into public.products (id, slug, name, category, base_price_ore)
  values (v_product_id, 'test-race', 'Test race', 'hero', 39600);

  insert into public.drops (id, name, slug, status, starts_at, ends_at, total_units, hype_copy)
  values (v_drop_id, 'Race drop', 'race-drop', 'live', v_now - interval '10 minutes', v_now + interval '2 hours', 10, 'Race');

  insert into public.drop_items (id, drop_id, product_id, role, price_ore, available_units)
  values (v_drop_item_id, v_drop_id, v_product_id, 'hero', 39600, 10);

  insert into public.pickup_nodes (id, name, type)
  values (v_node_id, 'Race node', 'own_stop');

  insert into public.pickup_windows (id, drop_id, node_id, starts_at, ends_at, cutoff_at, status)
  values (
    v_window_id,
    v_drop_id,
    v_node_id,
    v_now + interval '1 hour',
    v_now + interval '2 hours',
    v_now + interval '40 minutes',
    'open'
  );

  select id into v_slot_id
  from public.pickup_slots
  where window_id = v_window_id
  order by starts_at
  limit 1;

  for i in 1..100 loop
    insert into auth.users (id, email, created_at, updated_at, instance_id, aud, role)
    values (
      gen_random_uuid(),
      format('race-%s@test.local', i),
      now(), now(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated'
    )
    returning id into v_user;

    insert into public.profiles (id, email)
    values (v_user, format('race-%s@test.local', i))
    on conflict do nothing;

    begin
      perform public.reserve_order(
        v_user,
        v_drop_id,
        v_slot_id,
        jsonb_build_array(jsonb_build_object('drop_item_id', v_drop_item_id, 'quantity', 1)),
        0,
        600,
        0
      );
      v_success := v_success + 1;
    exception when others then
      v_err := SQLERRM;
      if v_err like '%insufficient_units%' or v_err like '%drop_not_live%' then
        v_fail := v_fail + 1;
      else
        raise;
      end if;
    end;
  end loop;

  perform set_config('test.reserve_success', v_success::text, false);
  perform set_config('test.reserve_fail', v_fail::text, false);
end $$;

select is(current_setting('test.reserve_success')::int, 10, '100 forsøk gir 10 reservasjoner');
select is(current_setting('test.reserve_fail')::int, 90, '100 forsøk gir 90 avvisninger');

select is(
  (select units_sold from public.drops where id = '71111111-1111-1111-1111-111111111111'),
  10,
  'drops.units_sold = 10'
);

select is(
  (select sold_units from public.drop_items where id = '72222222-2222-2222-2222-222222222222'),
  10,
  'drop_items.sold_units = 10'
);

select * from finish();
rollback;
