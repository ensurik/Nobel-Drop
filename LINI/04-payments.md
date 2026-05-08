# 04 — Betaling: Vipps + Stripe Apple Pay + Klarna

> Hele payment-handshaken — fra create-payment-intent til webhook-bekreftelse — med signaturverifisering og idempotency. Dette er det kritiske som blokker go-live.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 5, 9.
Les LINI/00-context.md.
Les supabase/functions/vipps-create-payment/index.ts, vipps-webhook/index.ts,
stripe-create-intent/index.ts, stripe-webhook/index.ts,
klarna-create-session/index.ts, klarna-webhook/index.ts,
supabase/functions/_shared/cors.ts, _shared/qr.ts.
Les apps/nobel-drop/app/(customer)/checkout.tsx.

Implementér full betalingsflyt for alle tre providers, med ekte sandbox-credentials,
HMAC-signaturverifisering, idempotency, og frontend-integrasjon.

═════════════════════════════════════════════════════════
DEL A — Vipps eCom v2
═════════════════════════════════════════════════════════

1. Sandbox-oppsett:
   - Hjelp meg registrere på portal.vippsmobilepay.com (testmiljø).
   - Hent: VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET, VIPPS_SUBSCRIPTION_KEY (Ocp-Apim-Subscription-Key), VIPPS_MERCHANT_SERIAL_NUMBER (MSN).
   - Sett alle i .env.production og kjør supabase secrets set --env-file .env.production.
   - Webhook-URL i Vipps dashboard: <SUPABASE_URL>/functions/v1/vipps-webhook

2. Hardenet vipps-webhook:
   - Verifisér HMAC-SHA256-signaturen Vipps sender i Authorization-headeren mot subscription key:
     ```ts
     const sig = req.headers.get("authorization");
     const expected = base64(hmacSha256(rawBody, subscriptionKey));
     if (sig !== expected) return errorResponse("invalid_signature", 401);
     ```
   - Idempotency: før confirm_order_paid, sjekk om provider_intent_id allerede er status='SALE' eller 'RESERVED'. Hvis ja, returner 200 OK uten side-effekt.
   - Logg signatur-mismatches til audit_log med IP.

3. e2e Vipps-test:
   - Skriv en script test/e2e/vipps-test.sh som:
     - Lager et test-drop via SQL
     - Kaller create-order via curl med en test-bruker
     - Følger redirect til Vipps test-app (manuell)
     - Verifiserer at webhook blir kalt og order.status='paid'
     - Verifiserer at pickup_qr_token er satt og at credits_ledger har en 'earned'-rad

═════════════════════════════════════════════════════════
DEL B — Stripe Apple Pay
═════════════════════════════════════════════════════════

1. Sandbox-oppsett:
   - Stripe Dashboard → Developers → API keys → Test mode → STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
   - Kjør stripe listen --forward-to localhost:54331/functions/v1/stripe-webhook for å få STRIPE_WEBHOOK_SECRET
   - Apple Merchant ID: registrer på developer.apple.com → bruk merchantIdentifier='merchant.no.nobeldrop'
   - Last opp .well-known/apple-developer-merchantid-domain-association til apps/nobel-drop/public/

2. Web (Apple Pay via Stripe Elements):
   - I apps/nobel-drop/app/(customer)/checkout.tsx, når payment_provider='stripe' OG Platform.OS='web':
     - Last @stripe/stripe-js
     - Bruk PaymentRequestButton (Apple Pay/Google Pay automatisk)
     - Når brukeren godtar: confirmPayment med client_secret fra create-order-respons
     - Vipps og Klarna skjules på Apple-devices der Apple Pay er tilgjengelig (UX-valg, ikke krav)

3. Native (Stripe React Native PaymentSheet):
   - Verifiser at @stripe/stripe-react-native er installert (er allerede i package.json)
   - I apps/nobel-drop/app/_layout.tsx, wrap med StripeProvider med publishableKey og merchantIdentifier
   - I checkout.tsx, når Platform.OS != 'web' og provider='stripe':
     - Initialize PaymentSheet med client_secret + customer + ephemeralKey
     - Present PaymentSheet
     - Etter suksess, vent på webhook (eller lytte til presentPaymentSheet-resultat)

4. Hardenet stripe-webhook:
   - Bruk stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
   - Idempotency: sjekk om event.id allerede er prosessert (legg til processed_stripe_events-tabell, eller bruk provider_intent_id-uniqueness)
   - Lytt på events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded

═════════════════════════════════════════════════════════
DEL C — Klarna Payments
═════════════════════════════════════════════════════════

1. Sandbox-oppsett:
   - Klarna Merchant Portal (playground): https://portal.playground.klarna.com
   - Hent KLARNA_USERNAME, KLARNA_PASSWORD
   - KLARNA_BASE_URL=https://api.playground.klarna.com

2. Web — Klarna Payments JS SDK:
   - Lag komponent apps/nobel-drop/components/checkout/KlarnaCheckout.web.tsx:
     - Last skript: <script src="https://x.klarnacdn.net/kp/lib/v1/api.js" />
     - Initialize: Klarna.Payments.init({ client_token })
     - Load: Klarna.Payments.load({ container: '#klarna-container', payment_method_category: 'pay_later' })
     - Authorize: Klarna.Payments.authorize({}, { ... order_data ... }, callback)
     - Send authorization_token til klarna-webhook for å fullføre

3. Native — Klarna Hosted Payment Page (HPP):
   - Lag KlarnaCheckout.tsx (native) som åpner expo-web-browser med en Klarna HPP-URL
   - Lytt etter redirect tilbake via deep-link og verifiser status

4. Hardenet klarna-webhook:
   - Verifisér HTTP Basic Auth-headeren matcher KLARNA_USERNAME:KLARNA_PASSWORD
   - Idempotency på provider_intent_id

═════════════════════════════════════════════════════════
DEL D — Felles
═════════════════════════════════════════════════════════

1. Rate-limit på create-order:
   - Bruk @upstash/ratelimit eller en enkel in-memory map med IP+user_id-key
   - Limit: 10 requests per minutt per user_id
   - Returner 429 ved overgang

2. Webhook idempotency-tabell:
   - Lag migration 0008_webhook_events.sql med tabell:
     CREATE TABLE webhook_events (
       provider text NOT NULL,
       event_id text NOT NULL,
       processed_at timestamptz DEFAULT now(),
       PRIMARY KEY (provider, event_id)
     );
   - Hver webhook sjekker eksistens før prosessering, INSERT etter.

3. Logging:
   - Strukturert log pre-confirm: console.log(JSON.stringify({ event, provider, order_id, amount, status }))
   - Aldri logg secrets (subscription key, signing secret, etc) — kun ID-er.

Lag/oppdater filer:
- supabase/functions/vipps-webhook/index.ts (HMAC + idempotency)
- supabase/functions/stripe-webhook/index.ts (constructEvent + idempotency)
- supabase/functions/klarna-webhook/index.ts (basic auth + idempotency)
- supabase/functions/_shared/rateLimit.ts (ny)
- supabase/functions/_shared/webhookIdempotency.ts (ny)
- supabase/functions/create-order/index.ts (legg til rate-limit)
- supabase/migrations/0008_webhook_events.sql
- apps/nobel-drop/components/checkout/StripeApplePay.web.tsx (ny)
- apps/nobel-drop/components/checkout/StripeApplePay.tsx (native, PaymentSheet)
- apps/nobel-drop/components/checkout/KlarnaCheckout.web.tsx (ny)
- apps/nobel-drop/components/checkout/KlarnaCheckout.tsx (native, HPP)
- apps/nobel-drop/app/(customer)/checkout.tsx (rute til riktig provider)
- apps/nobel-drop/app/_layout.tsx (StripeProvider)
- apps/nobel-drop/public/.well-known/apple-developer-merchantid-domain-association
- docs/vipps-setup.md, docs/stripe-setup.md, docs/klarna-setup.md (sjekklister)

Verifiser:
- Vipps test-app gir status='paid' på order
- Apple Pay PRB vises på Safari Mac med kort i Wallet
- Klarna sandbox kjøp fullføres
- Webhook med ugyldig signatur returnerer 401
- Samme webhook kalt to ganger gir én DB-side-effekt
```

---

## Acceptance criteria

- [ ] Alle tre providers fullfører ende-til-ende i sandbox med ekte test-flow
- [ ] HMAC/signaturverifisering avviser tampered requests
- [ ] Idempotency: dupliserte webhook-kall gir én side-effekt
- [ ] Rate-limit aktiv på create-order (10/min per user)
- [ ] Frontend ruter til riktig provider basert på Platform.OS

---

## Sandbox-kontoer du må sette opp manuelt (ingen scripting kan gjøre dette)

1. **Vipps:** portal.vippsmobilepay.com → Test → registrer test-merchant
2. **Stripe:** dashboard.stripe.com → Test mode (toggles top-right)
3. **Klarna:** portal.playground.klarna.com
4. **Apple Developer:** developer.apple.com → Identifiers → Merchant IDs → ny ID `merchant.no.nobeldrop`
