# 02 — Drop-engine: atomisk reservasjon og scarcity

> Verifisér og polér kjernen i hele plattformen — koden som sikrer at 22 makron-bokser aldri blir solgt 23 ganger, samtidig som "kun X igjen" oppdateres i sanntid.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.3, 3.4, 3.6 (reservasjons­mønster).
Les LINI/00-context.md.
Les supabase/migrations/0003_business_functions.sql nøye.
Les supabase/functions/create-order/index.ts.
Les apps/nobel-drop/app/(customer)/drop/[id].tsx.

Bygg ut drop-engine slik at den er race-safe, har full status-livssyklus,
og leverer live-stats til frontend.

1. Verifisér og hardene reserve_order():
   - Sjekk at funksjonen tar SELECT ... FOR UPDATE-låser i riktig rekkefølge (drops, så drop_items, så pickup_slots) for å unngå deadlocks.
   - Hvis ikke, omskriv slik at den alltid låser i samme rekkefølge sortert på UUID.
   - Returner strukturert resultat: { order_id, expires_at } eller raise med spesifikk SQLSTATE som klient kan fange.

2. Drop status-livssyklus:
   - Lag migration 0006_drop_status_transitions.sql med:
     - Trigger som setter status='live' når now() >= starts_at OG status='scheduled'
     - Trigger som setter status='sold_out' når units_sold >= total_units
     - Trigger som setter status='closed' når now() >= ends_at
   - Disse må kjøres som SECURITY DEFINER og logge til audit_log.

3. Live-stats funksjon:
   - Lag SECURITY DEFINER funksjon get_drop_stats(p_drop_id uuid) som returnerer:
     - units_left = total_units - units_sold
     - sold_last_5min, sold_last_15min, sold_total
     - velocity_label: 'cold' | 'warm' | 'hot' | 'sold_out'
     - estimated_sold_out_at (NULL hvis ikke nok data)
   - Lag edge function compute-drop-velocity som wrapper denne med 30s Cache-Control.

4. Realtime subscription:
   - I apps/nobel-drop/app/(customer)/drop/[id].tsx, sett opp Supabase Realtime-subscription på drop_items WHERE drop_id = $id.
   - Når sold_units endres, invalider React Query cache for ['drop', id] OG vis en mikro-animasjon "kun X igjen" som teller ned.

5. Race-test:
   - Skriv en pgTAP-test supabase/tests/reserve_order_race.sql som:
     - Setter opp et drop med total_units=10
     - Spawner 100 parallelle reserve_order-kall via DO-blokker eller pg_background
     - Verifiserer at nøyaktig 10 ordrer ble reserved og 90 fikk INSUFFICIENT_UNITS exception
     - Verifiserer at units_sold = 10, sold_units = 10 per drop_item
   - Kjør med supabase test db.

6. Reservasjons-utløp:
   - Verifisér at release_expired_reservations() korrekt:
     - Henter alle ordrer med status='reserved' AND reservation_expires_at < now()
     - Setter status='cancelled' og dekrementerer units_sold, sold_units, slot.reserved_count, window.reserved_count
     - Logger til audit_log
   - Hvis manglende, fix.

7. ScarcityBar-komponent:
   - Polér apps/nobel-drop/components/ScarcityBar.tsx slik at:
     - Viser "Kun X bokser igjen" med antall hentet fra get_drop_stats
     - Bytter til "Utsolgt" når units_left=0
     - Bytter til "Solgte X% siste 5 min" når velocity='hot'
     - Animerer endringer mykt (Reanimated)

Lag/oppdater filer:
- supabase/migrations/0006_drop_status_transitions.sql
- supabase/migrations/0007_drop_stats_function.sql
- supabase/functions/compute-drop-velocity/index.ts
- supabase/tests/reserve_order_race.sql
- apps/nobel-drop/app/(customer)/drop/[id].tsx (utvid med realtime + ScarcityBar)
- apps/nobel-drop/components/ScarcityBar.tsx (polér)

Verifiser:
- supabase test db viser grønn på reserve_order_race
- Manuell test: åpne to nettleser-faner på samme drop, bestill i én → den andre ser "Kun X igjen" telle ned i sanntid uten refresh
- Et drop som passerer ends_at får status='closed' automatisk (verifiser via SQL etter venting)
```

---

## Acceptance criteria

- [ ] Race-test viser at 100 parallelle ordrer på 10 units → 10 reserved, 90 insufficient
- [ ] Drop status-transisjoner skjer automatisk (scheduled → live → sold_out → closed)
- [ ] `compute-drop-velocity` returnerer korrekte tall innen 30s Cache-Control
- [ ] Live-counter "Kun X igjen" oppdateres uten refresh i drop-detalj
- [ ] `release_expired_reservations` ruller tilbake både unit-tellere OG slot-kapasitet (sjekkes i 11-cron)

---

## Avhengigheter

- Krever at `pg_cron` er satt opp (`11-cron-and-jobs.md`) for at status-triggere skal kjøre periodisk hvis ikke trigger-driven.
- `compute-drop-velocity` brukes også i marketing for "Forrige drop: solgt opp på 19 minutter"-stat hvis vi vil eksponere den.
