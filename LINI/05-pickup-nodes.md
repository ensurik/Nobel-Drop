# 05 — Pickup-nodes: noder, vinduer, slots, etterspørsels-aktivering

> Hele pickup-mekanikken: nodene (Lier til Tønsberg), vinduene per drop, slot-kapasitet, og volum-styrt aktivering. Dette er logistikk-motoren som lar Nobel skalere uten butikker.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.5 og 8.
Les Nobel.pdf side 14-17 (Datadrevet rute, Kickstarter-logistikk, Rute-mekanikken, Matematikken).
Les LINI/00-context.md.
Les supabase/migrations/0001_initial_schema.sql (pickup_nodes, pickup_windows, pickup_slots).
Les supabase/functions/evaluate-pickup-windows/index.ts.

Bygg ut node-systemet slik at det matcher visjonen om "vi kommer dit folket vil",
inkludert volum-aktivering, refusjonsmekanikk, og admin-CRUD.

1. Node-CRUD via SECURITY DEFINER:
   - Lag SQL-funksjoner i ny migration 0009_node_management.sql:
     - create_pickup_node(p_name, p_city, p_address, p_lat, p_lng, p_type, p_notes) → uuid
     - update_pickup_node(p_id, fields...)
     - deactivate_pickup_node(p_id)
   - Sjekk admin-rolle i hver. Aldri direkte INSERT fra klient.

2. Window-skjema:
   - I drop-wizard (07-admin-dashboard.md), når admin oppretter et drop:
     - Vis liste over aktive nodes med checkbox
     - For valgte nodes: input for starts_at (felles) og min_volume_required (per node)
     - cutoff_at = starts_at - 12h (hardkodet, men configurable)
   - Lag SECURITY DEFINER create_pickup_windows_for_drop(p_drop_id, p_node_ids jsonb, p_starts_at, p_min_volume_per_node int) som:
     - Oppretter et pickup_window per node
     - Genererer 3 stk pickup_slots (30-min intervaller) per window automatisk
     - Returnerer array av window_ids

3. Driver-tilordning:
   - Legg til pickup_windows.driver_id uuid REFERENCES profiles(id)
   - Tilordnes via admin-funksjon assign_window_driver(p_window_id, p_driver_id)
   - Brukes av (pickup)/index.tsx for å vise dagens vinduer per sjåfør

4. Evaluerings-funksjon (evaluate-pickup-windows edge function):
   - Kjøres av cron hvert 5. minutt (se 11-cron-and-jobs.md)
   - For hvert window med status='open' og cutoff_at < now():
     - Hvis reserved_count >= min_volume_required:
       - Sett status='confirmed'
       - Send push-varsel til alle ordrer på vinduet: "Hentingen din er bekreftet — møt oss på X kl. Y"
     - Hvis reserved_count < min_volume_required:
       - Sett status='cancelled_refund'
       - Kall refund_pickup_window(window_id) som refunderer alle ordrer
       - Send push-varsel: "Stoppet ditt nådde ikke nok bestillinger. Du har fått full refusjon, eller kan velge et annet stopp i appen innen 24 timer."

5. Refusjon-flyt:
   - refund_pickup_window() i 0003_business_functions.sql skal:
     - Sette alle ordrer på vinduet til status='refunded'
     - Logge refund_reason='window_cancelled_min_volume'
     - Frigjør units_sold og sold_units tilbake til drop og drop_items
     - Trigger faktisk refusjon hos payment provider:
       - Vipps: kall Vipps refund API
       - Stripe: stripe.refunds.create({ payment_intent: ... })
       - Klarna: kall Klarna refund API
   - Lag separat edge function process-refund som tar order_id og kaller riktig provider basert på payment_provider.

6. Forslag-til-flytte-stopp:
   - Når et window blir cancelled_refund, før refusjon prosesseres:
     - Send push med deep-link til app: "Vil du flytte til [annen aktiv node]? Trykk her."
     - Hvis bruker aksepterer innen 24t: edge function move-order-to-window(p_order_id, p_new_window_id) som flytter ordren uten å refundere
     - Hvis ikke: refusjon prosesseres automatisk

7. Admin node-vindu-oversikt (apps/nobel-drop/app/(admin)/windows.tsx):
   - Tabell over alle aktive vinduer med kolonner:
     - Drop-navn, node-navn, dato/tid
     - reserved_count / min_volume_required (med visuell volum-meter)
     - Time til cutoff
     - Status-badge
     - Actions: "Avlys nå", "Send påminnelse"

Lag/oppdater filer:
- supabase/migrations/0009_node_management.sql
- supabase/migrations/0010_window_driver.sql
- supabase/functions/evaluate-pickup-windows/index.ts (utvid med refund-trigger + push)
- supabase/functions/process-refund/index.ts (ny — provider-spesifikk refusjon)
- supabase/functions/move-order-to-window/index.ts (ny)
- apps/nobel-drop/app/(admin)/nodes.tsx (utvid med CRUD-form)
- apps/nobel-drop/app/(admin)/windows.tsx (utvid med volum-meter + actions)

Verifiser:
- pgTAP test: opprett window med min_volume=10, reserve 5 ordrer, kjør evaluate → status='cancelled_refund', alle ordrer refundert
- pgTAP test: samme men med 10 reserve → status='confirmed', units_sold uendret
- Manuell admin-test: opprett ny node via UI, scheduler et drop med vinduer på den, verifiser i SQL at slots ble generert
```

---

## Acceptance criteria

- [ ] Admin kan opprette/endre nodes via UI uten direkte DB-tilgang
- [ ] Window-evaluering kjører automatisk og refunderer korrekt
- [ ] Provider-spesifikk refusjon fungerer for alle tre providers
- [ ] Bruker får valg om å flytte ordre før refusjon prosesseres
- [ ] Admin ser live volum-meter per vindu med actions

---

## Avhengigheter

- Krever `11-cron-and-jobs.md` for å trigge evaluate-pickup-windows automatisk
- Krever `09-notifications.md` for push-varsler ved status-endring
- Krever `04-payments.md` for provider-refusjons-API
