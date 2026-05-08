# 00 — Kontekst: Hva finnes, hva mangler

> **Les denne FØR du kjører noen av de andre promptene.** Den oppsummerer kodebasen slik den står i dag, slik at du ikke gjenoppfinner ting eller bryter noe som allerede fungerer.

---

## Prompt — gi denne til Claude Code først i hver økt

```
Les PROJECT_BRIEF.md i sin helhet. Les README.md. Les LINI/00-context.md.

Deretter, gå gjennom:
1. supabase/migrations/0001_initial_schema.sql
2. supabase/migrations/0002_rls_policies.sql
3. supabase/migrations/0003_business_functions.sql
4. apps/nobel-drop/lib/api.ts
5. apps/nobel-drop/lib/supabase.ts
6. apps/nobel-drop/app/_layout.tsx
7. supabase/functions/create-order/index.ts
8. supabase/functions/_shared/qr.ts

Når du er ferdig: gi meg en 5-linjers status om hva du tror er
ferdig vs mangelfullt. Spør meg hvilken LINI-prompt jeg vil kjøre.
Ikke skriv kode før jeg sier hvilken prompt vi starter med.
```

---

## Snapshot per 2026-05

### Backend (Supabase)

**Ferdig:**
- Hele datamodellen (`profiles`, `products`, `drops`, `drop_items`, `pickup_nodes`, `pickup_windows`, `pickup_slots`, `orders`, `order_items`, `credits_ledger`, `payment_intents`, `push_subscriptions`, `audit_log`)
- RLS-policies for alle tabeller
- Atomiske SQL-funksjoner: `reserve_order`, `confirm_order_paid`, `release_expired_reservations`, `refund_pickup_window`
- Seed-data for utvikling

**Mangelfullt eller manglende:**
- `pg_cron`-jobber er IKKE satt opp (ingen automatisk frigjøring av utgåtte reservasjoner, ingen vindu-evaluering)
- HMAC-signaturverifisering i Vipps/Stripe/Klarna webhooks er ikke implementert
- Idempotency-sjekker i webhooks er ikke implementert
- Ingen tester (pgTAP / Deno.test / Playwright)
- Ingen `area_votes`-tabell (ny — kommer fra marketing-stemme-skjemaet)

### Edge functions (Deno)

**Ferdig (skjelett):**
- `create-order` — atomisk reservasjon + payment intent
- `vipps-create-payment`, `vipps-webhook`
- `stripe-create-intent`, `stripe-webhook`
- `klarna-create-session`, `klarna-webhook`
- `verify-pickup`
- `evaluate-pickup-windows`
- `send-drop-notification`

**Mangelfullt:**
- Sandbox-credentials for alle tre payment-providers er IKKE satt
- Webhook-signaturverifisering mangler
- Idempotency mangler
- Rate-limit på `create-order` mangler
- Native push (Expo) er ikke koblet til `send-drop-notification`

### Frontend — Expo-app (`apps/nobel-drop/`)

**Ferdig:**
- Auth (magic link)
- Customer flow: hjem, drop-detalj, checkout-skall, ordre-liste, QR-pass, account
- Theming (NativeWind, dark + gold)
- Datalag (`lib/api.ts` med React Query)
- Service worker for web push

**Mangelfullt eller manglende:**
- Drop-wizard i admin (`(admin)/drops/new.tsx` er en stub — drops opprettes manuelt via SQL i dag)
- Native push-registrering (`lib/push.ts:registerNativePush` er stub)
- Kart i pickup-velger (kun liste i `(customer)/checkout.tsx`)
- Apple Pay frontend-flyt (Stripe PaymentSheet ikke integrert)
- Klarna JS SDK ikke integrert
- Sjåfør-skannerflyt fungerer mot stubbet API
- Admin KPI-dashboard er placeholder
- Ordre-overvåkning i admin er placeholder

### Marketing — Astro (`apps/nobel-marketing/`)

**Ferdig:**
- Cream/light editorial design med Fraunces + Inter
- Forsiden med video-hero + ink-reveal animation
- Undersider: Slik fungerer det, Sortimentet, Hentesteder, Om Nobel, FAQ, Kontakt
- "Stem frem ditt område"-skjema (mailto til `omrade@nobeldrop.no`)
- Auto-deploy via GitHub Actions til `/public_html/`

**Mangelfullt:**
- "Stem frem ditt område" går til mailto — bør gå til en ekte endpoint som lagrer i `area_votes`
- CTA-er peker til `shop.nobeldrop.no` per nå — endre til `app.nobeldrop.no` når den er live

---

## URL-er og rolle-kart

| URL | Rolle | Hvem ser det |
|---|---|---|
| `nobeldrop.no` | Marketing | Anonyme besøkende — funnel til app |
| `app.nobeldrop.no` | Customer + admin + driver app | Innloggede brukere; rolle bestemmer hvilken seksjon |
| `<supabase-ref>.supabase.co` | API + edge functions | Internt (kalles fra app) |

App-en har tre rolle-flows i samme kodebase, separert via Expo Router groups:
- `(customer)/` — vanlig bruker
- `(admin)/` — admin (skiftes via service_role i DB)
- `(pickup)/` — driver (skiftes via service_role i DB)

`app/index.tsx` redirecter basert på `profile.role`.

---

## Hva du IKKE skal endre uten å spørre

- `PROJECT_BRIEF.md` — fasit. Endre kun via godkjenning.
- `Nobel.pdf` — opprinnelig spec. Aldri endre.
- `supabase/migrations/0001_initial_schema.sql` — datamodellen. Lag nye migrations (0005, 0006...) for endringer.
- `apps/nobel-marketing/` — ferdig design. Promptene her rører kun ett felt: "stem frem ditt område"-skjemaet kan trenge å peke til en ekte endpoint.

---

## Hva som kommer "gratis" hvis du følger PROJECT_BRIEF

- Alle invariants (drop-volum, slot-kapasitet, kreditt-ledger) håndheves på databasenivå via SECURITY DEFINER-funksjoner.
- All write-tilgang fra klient går via edge functions med service_role.
- Det betyr at du **aldri** skal lage direkte `supabase.from('orders').insert()` fra klient — alltid via en edge function.
