# 10 — Nobel-kreditt: tier-stigen, ledger, utløp

> Kreditt-systemet. Aldri rabatt — alltid kreditt. Skaper gjenkjøp og massiv AOV uten å bryte premium-følelsen.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.7 (credits_ledger) og Nobel.pdf side 13 (Handlekurv-Motoren).
Les LINI/00-context.md.
Les supabase/migrations/0001_initial_schema.sql (credits_ledger, user_credit_balances).
Les supabase/migrations/0003_business_functions.sql (confirm_order_paid).

Bygg ut kreditt-mekanikken til full produksjon.

1. Tier-evaluering i confirm_order_paid:
   - Verifisér at confirm_order_paid:
     - Beregner subtotal_ore (uten credit_applied_ore som ble trukket)
     - Mapper subtotal til kredittgrad:
       - >= 200000 (2000 kr): 20%
       - >= 150000 (1500 kr): 15%
       - >= 100000 (1000 kr): 10%
       - else: 0%
     - INSERT til credits_ledger med:
       - type='earned'
       - amount_ore = floor(subtotal * tier_pct)
       - balance_after_ore = previous_balance + amount_ore
       - expires_at = now() + 90 days
       - note = 'Tier {pct}% på drop {drop_name}'
   - Trigger ny INSERT med type='spent' når ordre brukt kreditt — beløp = -credit_applied_ore.

2. Tier-grenser som config:
   - Lag migration 0016_credit_config.sql med:
     ```sql
     CREATE TABLE app_config (key text PRIMARY KEY, value jsonb);
     INSERT INTO app_config VALUES
       ('credit_tiers', '[{"min_ore":100000,"pct":0.10},{"min_ore":150000,"pct":0.15},{"min_ore":200000,"pct":0.20}]'),
       ('credit_expiry_days', '90'),
       ('min_order_ore', '39600');
     ```
   - Endre confirm_order_paid til å lese fra app_config istedenfor hardkodet.

3. Utløps-jobb:
   - Lag SECURITY DEFINER funksjon expire_old_credits() som:
     - Finner alle credits_ledger-rader med type='earned' OG expires_at < now() OG ikke allerede expired
     - For hver: INSERT en motpost med type='expired' og amount_ore = -original_amount, balance_after_ore = previous_balance - amount_ore, note = 'Utløpt fra ordre {x}'
   - Schedule via pg_cron (se 11-cron-and-jobs.md) til å kjøre daglig kl. 02:00.

4. Saldo-view:
   - Verifisér at user_credit_balances-view summerer korrekt (kun rader hvor expires_at IS NULL OR > now())
   - Lag også user_credit_history-view som returnerer siste 50 transaksjoner per bruker, joint med order-info hvis order_id finnes.

5. Frontend — Tier-stige (apps/nobel-drop/components/TierLadder.tsx):
   - Visuell stige med 4 trinn (Nivå 1, 2, 3, 4)
   - Aktuelt tier markert med gull-glow
   - Neste tier viser "200 kr unna 15%-tier"
   - Bruk i: account-siden, og som inline prompt i checkout

6. Frontend — Bruk-kreditt-toggle:
   - I checkout, hvis user_credit_balance > 0:
     - Toggle: "Bruk Nobel-kreditt"
     - Når på: trekk min(saldo, total) fra subtotal — vis som egen linje
     - Pass på at tier-bonus beregnes på SUBTOTAL FØR kreditt-trekk (slik confirm_order_paid skal gjøre)

7. Account — Kreditt-historikk:
   - apps/nobel-drop/app/(customer)/account.tsx skal vise:
     - Stor saldo øverst med tier-stige
     - "Utløper 250 kr om 14 dager"-påminnelse
     - Liste over siste 10 transaksjoner med dato, type-ikon, beløp, ordre-link

8. Manual adjust (admin):
   - Lag SECURITY DEFINER adjust_credit_manual(p_user_id, p_amount_ore, p_note) — kun admin
   - INSERT til credits_ledger med type='manual_adjust', logger til audit_log
   - Eksponér via admin-portalen i kunde-detalj-modal

Lag/oppdater filer:
- supabase/migrations/0016_credit_config.sql
- supabase/migrations/0017_credits_views.sql
- supabase/migrations/0018_expire_credits_function.sql
- supabase/migrations/0003_business_functions.sql (oppdatér confirm_order_paid til å lese fra app_config)
- apps/nobel-drop/components/TierLadder.tsx (ny)
- apps/nobel-drop/components/CreditHistoryList.tsx (ny)
- apps/nobel-drop/app/(customer)/account.tsx (utvid med saldo + historikk)
- apps/nobel-drop/app/(customer)/checkout.tsx (toggle + tier-prompt)
- apps/nobel-drop/lib/api.ts (legg til api.credits.history())

Verifiser:
- pgTAP-test: bestilling på 1499 kr → ingen kreditt. Bestilling på 1500 kr → 225 kr (15%) earned med expires_at 90 dager
- Manuell test i appen: bestiller for 1200 kr, ser 120 kr kreditt på account
- Bruker krediten i neste bestilling, ser balansen oppdateres riktig
- Manual adjust fra admin reflekteres umiddelbart hos bruker
```

---

## Acceptance criteria

- [ ] Kreditt utløses presist på rett tier-grense
- [ ] Bruk av kreditt påvirker IKKE neste tier-beregning
- [ ] Utløp-jobb tilbakestiller saldo korrekt
- [ ] Tier-stige viser konkret "X kr fra neste tier"-tall
- [ ] Admin-adjust er sporet i audit_log

---

## Avhengigheter

- `02-drop-engine.md` for confirm_order_paid
- `11-cron-and-jobs.md` for daglig expire_old_credits-jobb
