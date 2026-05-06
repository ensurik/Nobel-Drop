-- =====================================================================
-- Seed-data for utvikling/pilot. Trygt å re-kjøre (alle ON CONFLICT).
-- =====================================================================

-- Produkter
insert into public.products (slug, name, description, category, base_price_ore, is_active)
values
  ('signatur-makron-4', 'Signatur-makron 4-pack', 'Hero-produktet. Fire håndlagde signaturmakroner med gullfolium.', 'hero', 39600, true),
  ('signatur-makron-6', 'Signatur-makron 6-pack', 'Større boks. Seks signaturmakroner.', 'hero', 54000, true),
  ('signatur-makron-8', 'Signatur-makron 8-pack', 'Den største drop-boksen. Åtte makroner.', 'hero', 69600, true),
  ('petit-four-mix', 'Petit four-miks', 'Liten boks med fire petit fours. Perfekt add-on.', 'addon', 14900, true),
  ('porsjonskaker-2', 'Porsjonskaker 2-pack', 'Visuelt sterke desserter for 2 personer.', 'addon', 19900, true),
  ('porsjonskaker-4', 'Porsjonskaker 4-pack', '4 porsjonskaker for helg/besøk.', 'addon', 36900, true),
  ('premium-kake-bursdag', 'Premiumkake (bursdag)', 'Selve ryggraden — kaken til bursdag, helg og feiring.', 'main_cake', 49900, true),
  ('coq-au-vin-singel', 'Coq au vin (singelpakket)', 'Premium hverdagsmiddag. Aktiveres i fase 2.', 'dinner', 24900, false),
  ('viltgryte-singel', 'Viltgryte (singelpakket)', 'Premium hverdagsmiddag. Aktiveres i fase 2.', 'dinner', 27900, false)
on conflict (slug) do nothing;

-- Pickup-noder (rute i blueprint: Lier, Drammen, Holmestrand, Horten, Tønsberg)
insert into public.pickup_nodes (name, city, address, lat, lng, type, is_active)
values
  ('Lier — partnerutlevering', 'Lier', 'Lier sentrum', 59.7847, 10.2451, 'partner', true),
  ('Drammen — partnerutlevering', 'Drammen', 'Drammen sentrum', 59.7440, 10.2045, 'partner', true),
  ('Holmestrand', 'Holmestrand', 'Holmestrand torg', 59.4915, 10.3145, 'own_stop', true),
  ('Horten', 'Horten', 'Horten sentrum', 59.4170, 10.4830, 'own_stop', true),
  ('Tønsberg', 'Tønsberg', 'Tønsberg sentrum', 59.2680, 10.4076, 'own_stop', true)
on conflict do nothing;

-- En demo-drop "Fredagsdrop" som er live nå (kun for utvikling)
do $$
declare
  v_drop_id uuid;
  v_node_id uuid;
  v_window_id uuid;
  v_hero_id uuid;
  v_addon_id uuid;
  v_main_id uuid;
begin
  -- Fjern eksisterende dev-drop
  delete from public.drops where slug = 'demo-fredagsdrop';

  insert into public.drops (slug, name, status, starts_at, ends_at, total_units,
                            hype_copy, cover_image_url)
  values ('demo-fredagsdrop', 'Fredagsdrop — demo', 'live',
          now() - interval '1 hour', now() + interval '6 hours',
          50, 'Begrenset antall lansert. Sikre din boks.',
          'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200')
  returning id into v_drop_id;

  select id into v_hero_id from public.products where slug = 'signatur-makron-4';
  select id into v_addon_id from public.products where slug = 'petit-four-mix';
  select id into v_main_id from public.products where slug = 'premium-kake-bursdag';

  insert into public.drop_items (drop_id, product_id, role, price_ore, available_units, display_order)
  values
    (v_drop_id, v_hero_id, 'hero', 39600, 50, 1),
    (v_drop_id, v_addon_id, 'addon', 14900, 100, 2),
    (v_drop_id, v_main_id, 'order_lifter', 49900, 20, 3);

  -- Lag pickup-windows for hver node, kl 16:00-17:30 lokalt (UTC i kode)
  for v_node_id in select id from public.pickup_nodes where is_active loop
    insert into public.pickup_windows (
      drop_id, node_id, starts_at, ends_at, min_volume_required, cutoff_at
    ) values (
      v_drop_id, v_node_id,
      date_trunc('day', now()) + interval '16 hours',
      date_trunc('day', now()) + interval '17 hours 30 minutes',
      3,
      date_trunc('day', now()) + interval '4 hours'
    );
  end loop;
end $$;
