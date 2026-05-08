# 15 — Sikkerhets-sjekkliste før go-live

> Siste port før Nobel Drop går live. Verifiserer at alt det vi bygde i de andre promptene faktisk holder vann under angrep.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 4 og 9 i sin helhet.
Les CURSOR.md seksjon 12 (Sikkerhets-checklist).
Les LINI/00-context.md.

Gå gjennom hele systemet med sikkerhets-briller. Rapportér resultatet
som en checkliste, og fix alt som ikke holder.

═════════════════════════════════════════════════════════
1. RLS-audit
═════════════════════════════════════════════════════════

For hver tabell, verifiser:
- RLS er PÅ (sjekk pg_class.relrowsecurity)
- Det finnes minst én policy for SELECT, INSERT, UPDATE, DELETE — eller eksplisitt blokkerte
- Tester pgTAP/rls_roles.sql passerer for alle 4 roller (anon, customer, driver, admin, service_role)

Tabeller som krever ekstra sjekk:
- orders: customer ser kun sine egne; driver ser kun sine tilordnede vinduer
- credits_ledger: customer SELECT egen, INSERT/UPDATE/DELETE blokkert (kun via SECURITY DEFINER funksjoner)
- audit_log: kun admin SELECT
- analytics_events: kun service_role + admin SELECT
- area_votes: kun service_role + admin SELECT

═════════════════════════════════════════════════════════
2. Skriving via service_role only
═════════════════════════════════════════════════════════

Bruk `grep -r 'supabase.from(' apps/` til å finne alle direkte client writes.
Verifiser at alle SKRIVINGER til:
- orders, order_items, drops, drop_items, pickup_windows, pickup_slots, credits_ledger, payment_intents, audit_log

…skjer KUN via edge functions med service_role, ikke direkte fra klient.

OK å skrive direkte fra klient til:
- profiles (begrenset til egen rad via RLS)
- push_subscriptions (egen rad via RLS)

═════════════════════════════════════════════════════════
3. Webhook-signaturer
═════════════════════════════════════════════════════════

Verifiser at alle tre webhooks avviser ugyldige signaturer:
- vipps-webhook: HMAC-SHA256 mot subscription key
- stripe-webhook: stripe.webhooks.constructEvent
- klarna-webhook: HTTP Basic Auth match

Test: send curl med tampered body, forventer 401.

═════════════════════════════════════════════════════════
4. QR-token sikkerhet
═════════════════════════════════════════════════════════

Verifiser:
- PICKUP_QR_SECRET er 32+ random bytes
- signPickupToken inkluderer order_id + utstedt-tidspunkt
- verifyPickupToken sjekker HMAC + at issued < 8 timer siden
- Token kan ikke brukes for andre ordrer (HMAC binder til order_id)

Test: signed token for order A kan ikke brukes for order B (forventer reject).

═════════════════════════════════════════════════════════
5. Rate-limit
═════════════════════════════════════════════════════════

- create-order: 10 requests/min per user_id
- submit-area-vote: 3 per IP per 24t
- magic-link send: 3 per email per 5min (Supabase Auth har dette innebygd)
- verify-pickup: 60 per min per driver_id (ikke kritisk, men beskytter mot bug-loops)

Test: 11. request på create-order returnerer 429.

═════════════════════════════════════════════════════════
6. Race-safety
═════════════════════════════════════════════════════════

Kjør pgTAP/race_conditions.sql:
- 100 parallelle reserve_order på 10-unit drop → 10 reserved, 90 insufficient
- 20 parallelle reserve på 10-cap slot → 10 booket, 10 insufficient_slot
- Parallel confirm + release av samme order → idempotent, ingen dobbel-kreditt

═════════════════════════════════════════════════════════
7. Logg-hygiene
═════════════════════════════════════════════════════════

`grep -r 'console.log' supabase/functions/` og verifiser at INGEN av disse logger:
- VIPPS_CLIENT_SECRET
- STRIPE_SECRET_KEY
- KLARNA_PASSWORD
- PICKUP_QR_SECRET
- Hele JWT-token
- Brukers passord eller magic-link-token

OK å logge: provider, order_id, amount, status, error.message.

═════════════════════════════════════════════════════════
8. Captcha og signup-beskyttelse
═════════════════════════════════════════════════════════

- Supabase Auth → Settings → Captcha aktiv (hCaptcha eller Turnstile)
- Magic-link rate-limit aktiv (Supabase default)
- Email-verifisering ikke nødvendig for vår flyt (magic-link er allerede verifisering), men dobbeltsjekk at uautentisert epost ikke kan utløse spam

═════════════════════════════════════════════════════════
9. Refund-trigger sikkerhet
═════════════════════════════════════════════════════════

- refund_pickup_window kan kun kalles fra service_role
- refund-order edge function verifiserer at caller er admin før den prosesserer
- Manuelle refunds logges til audit_log med actor_id

═════════════════════════════════════════════════════════
10. Storage-bucket-policy
═════════════════════════════════════════════════════════

- 'drop-images': public read, INSERT kun admin
- 'avatar': public read, UPDATE kun eier
- Ingen bucket med public WRITE

═════════════════════════════════════════════════════════
11. Universal-link risiko
═════════════════════════════════════════════════════════

- apple-app-site-association og assetlinks.json refererer kun til våre signerte sertifikater
- Magic-link-callback verifiserer ALLTID session-token mot Supabase før redirect

═════════════════════════════════════════════════════════
12. CORS-policy
═════════════════════════════════════════════════════════

- Edge functions har CORS som tillater kun nobeldrop.no, app.nobeldrop.no
- Aldri Access-Control-Allow-Origin: * for endpoints som leser bruker-data

═════════════════════════════════════════════════════════
13. Audit-log retensjon
═════════════════════════════════════════════════════════

- audit_log beholdes i 2 år (regnskaps-relaterte rows)
- analytics_events beholdes i 90 dager
- Lag pg_cron-jobb for å slette eldre rader

═════════════════════════════════════════════════════════
14. Secrets rotation-policy
═════════════════════════════════════════════════════════

- Plan for å rotere PICKUP_QR_SECRET, STRIPE_WEBHOOK_SECRET hver 6 mnd
- Når roteres: nye token signeres med ny secret, gamle token må fortsatt verifiseres til de utløper (overlapp-vindu på 7 dager)

═════════════════════════════════════════════════════════
15. Personvern
═════════════════════════════════════════════════════════

- /personvern (allerede skrevet) reflekterer faktisk databehandling
- Sletting på forespørsel: lag SECURITY DEFINER funksjon delete_user_data(user_id) som anonymiserer ordrer (beholder for regnskap), sletter profile, push_subscriptions, analytics_events
- Eksport på forespørsel: SQL-script som dumper all bruker-data til JSON

═════════════════════════════════════════════════════════
SLUTT-LEVERANSE
═════════════════════════════════════════════════════════

Skriv resultat som docs/security-audit-YYYY-MM-DD.md med:
- Hver punkt 1-15: PASS / FAIL / FIXED
- For hver FAIL/FIXED: lenke til commit som fikset
- En "Klar for go-live"-erklæring (ja/nei) til slutt

Hvis det er noen FAIL: stopp, fix, kjør auditet på nytt før go-live.
```

---

## Acceptance criteria

- [ ] docs/security-audit-YYYY-MM-DD.md er skrevet med alle 15 punkter
- [ ] Alle punkter er PASS eller FIXED
- [ ] Race-tester passerer
- [ ] Webhook-signatur-tester passerer
- [ ] Ingen secrets logges i edge functions
- [ ] Sletting/eksport av bruker-data fungerer

---

## Etter audit

Når audit er grønn: vi er klar for begrenset pilot. Begynn med:
1. Inviter 50 betatestere fra Bærum
2. Kjør et kontrollert drop med kun makron
3. Etter 2-3 vellykkede drops: åpne for offentlig signup på nobeldrop.no
4. Skaler til andre stopp basert på area_votes-data
