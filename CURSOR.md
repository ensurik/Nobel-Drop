# CURSOR.md — Slik fortsetter du i Cursor med Claude Code

Dette prosjektet er satt opp som en komplett scaffold. Database-skjema, edge functions, kunde-frontend, admin og pickup-skall er klare. Det som gjenstår er polering, ekte sandbox-credentials, og noen "stretch"-features som er stubbet.

Bruk denne fila som en **prompt-bok**. Åpne hele prosjektet i Cursor. Hver prompt under kan kopieres direkte inn i Claude Code (Cmd/Ctrl + L) — den er skrevet for å gi nok kontekst slik at Claude bygger riktig.

> 🧭 **Viktig**: Begynn alltid med å be Claude Code lese `PROJECT_BRIEF.md` før den koder noe. Den er fasit for arkitektur, datamodell og forretningsregler.

---

## 0. Førstegangs-oppsett (gjør én gang)

```bash
# 1. Installer
npm install
# 2. Lokal Supabase
supabase start && supabase db reset
# 3. Miljø
cp .env.example .env.production
cp apps/nobel-drop/.env.example apps/nobel-drop/.env.local
# Fyll inn fra `supabase status`

# 4. Sett service-side hemmeligheter
supabase secrets set --env-file .env.production

# 5. Start frontend
cd apps/nobel-drop && npm run web
```

**Lag deg selv som admin:** Åpne Supabase Studio (`http://localhost:54323`) og kjør:
```sql
update public.profiles set role='admin' where email='din@epost.no';
```

---

## 1. Vipps eCom — full sandbox-handshake

> Vipps `vipps-create-payment` og `vipps-webhook` er skrevet, men trenger ekte test-credentials og verifisert callback.

**Prompt til Claude Code:**

```
Les PROJECT_BRIEF.md seksjon 5 og 9. Les supabase/functions/vipps-create-payment/index.ts og vipps-webhook/index.ts.

Sett opp Vipps test-merchant og verifiser fullt løp:

1. Hjelp meg registrere på portal.vippsmobilepay.com (testmiljø).
2. Forklar nøyaktig hvilke 4 verdier jeg må sette i .env.production:
   VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET, VIPPS_SUBSCRIPTION_KEY,
   VIPPS_MERCHANT_SERIAL_NUMBER.
3. Verifiser at webhook-callback URL er satt korrekt:
   {SUPABASE_URL}/functions/v1/vipps-webhook
4. Legg til signaturverifisering i vipps-webhook:
   Vipps sender HMAC-SHA256 i `Authorization`-headeren basert på
   subscription key. Implementer dette og avvis requests uten gyldig
   signatur.
5. Legg til retry/idempotency: hvis confirm_order_paid har kjørt
   før (samme provider_intent_id), returner 200 OK uten side-effekt.
6. Skriv en e2e-test som faktisk gjør et test-kjøp via Vipps test-app
   og verifiser at ordrestatus blir 'paid' og pickup_qr_token settes.

Lever koden + en sjekkliste i `docs/vipps-setup.md`.
```

---

## 2. Stripe Apple Pay — full integrasjon

```
Les supabase/functions/stripe-create-intent/index.ts og stripe-webhook/index.ts.
Les apps/nobel-drop/app/(customer)/checkout.tsx.

Bygg ekte Apple Pay-flyt:

1. Web: bruk @stripe/stripe-js + Stripe Elements PaymentRequestButton.
   I checkout.tsx, når payment_provider === 'stripe', vis ApplePayKnapp
   som tar client_secret fra create-order respons.
2. Native: integrer @stripe/stripe-react-native (allerede i package.json).
   Bruk PaymentSheet API. Konfigurer merchantIdentifier og countryCode='NO'.
3. Konfigurer Apple Merchant ID og last opp .well-known/apple-developer-merchantid-domain-association
   til Vercel public/.
4. Bygg test for både kort og Apple Pay i sandbox.

Husk: Stripe webhook-endepunktet trenger STRIPE_WEBHOOK_SECRET fra
stripe-cli `stripe listen --forward-to ...`. Dokumenter dette i
docs/stripe-setup.md.
```

---

## 3. Klarna Payments — frontend-integrasjon

```
Les supabase/functions/klarna-create-session/index.ts og klarna-webhook/index.ts.

Klarna trenger en JS SDK på frontend. Lag en KlarnaCheckout-komponent som:

1. Henter client_token fra create-order (provider='klarna').
2. På web: laster https://x.klarnacdn.net/kp/lib/v1/api.js og kaller
   Klarna.Payments.init({ client_token }), Klarna.Payments.load(...)
   og .authorize(...).
3. På native: bruk InAppBrowser/expo-web-browser med Klarna hosted page
   (HPP) — SDK finnes ikke for RN.
4. Etter authorize, send authorization_token til klarna-webhook
   for å fullføre.

Endre apps/nobel-drop/app/(customer)/checkout.tsx slik at Klarna-flyten
trigger denne komponenten i stedet for redirect.
```

---

## 4. Drop-wizard i admin

```
apps/nobel-drop/app/(admin)/drops/new.tsx er en stub.

Bygg en multi-steg wizard:

1. Steg 1 — Grunnleggende: navn, slug (auto fra navn), starts_at, ends_at,
   total_units, hype_copy, cover_image_url (Supabase Storage upload).
2. Steg 2 — Produkter: list alle products med category in (hero, addon,
   main_cake) som checkbox + felt for price_ore + available_units + role.
   Dra for å sette display_order.
3. Steg 3 — Pickup-vinduer: la admin velge nodes, sette starts_at og
   min_volume_required. Lag windows for alle valgte noder med samme tid.
4. Steg 4 — Bekreft: vis sammendrag og insert atomisk via en RPC-funksjon
   create_drop_with_items_and_windows.

Skriv en SQL-funksjon `create_drop_with_items_and_windows(p_drop jsonb,
p_items jsonb, p_windows jsonb)` som gjør hele insert i én transaksjon.
Legg den i ny migration 0005_drop_wizard.sql.

Bruk react-hook-form med zod-validering.
```

---

## 5. Realtime drop-stats + "Utsolgt på 14 minutter"-banner

```
I apps/nobel-drop/app/(customer)/drop/[id].tsx er Realtime allerede satt opp.

Bygg en "live activity"-bar over hero-produktet som viser:
- "Kun X bokser igjen" (oppdaterer i sanntid)
- "Solgte 23 % de siste 5 minuttene" (beregn fra recent orders.created_at)
- Når drop går sold_out: "Utsolgt på Y minutter" — beregn ends_at - first_paid_at.

Legg til en ny edge function compute-drop-velocity som:
- input: drop_id
- query: count orders.created_at over siste 5 min vs forrige 5 min
- returner: sold_last_5min, sold_total, velocity_label.

Cache 30 sek (Cache-Control headers).
```

---

## 6. Native push-varsler (iOS/Android)

```
apps/nobel-drop/lib/push.ts har et stub for registerNativePush.
apps/nobel-drop/public/sw.js er klar for web.

Implementer native push:

1. Installer expo-notifications (allerede i package.json) og legg til
   plugin i app.json med permissions for iOS.
2. I _layout.tsx, etter auth, kjør:
   - Notifications.requestPermissionsAsync()
   - Hvis granted: getExpoPushTokenAsync({ projectId: extra.eas.projectId })
   - Upsert token i push_subscriptions med platform=Platform.OS.
3. Sett opp APNs-sertifikat (iOS) og FCM-key (Android) hos Expo.
4. Test send-drop-notification med en ekte device.

Test både på fysisk iOS og Android. Web push er allerede klart via sw.js.
```

---

## 7. Kart i pickup-velger

```
apps/nobel-drop/app/(customer)/checkout.tsx viser pickup-noder som liste.

Bygg en kart-versjon med fallback til liste:

- Web: react-leaflet (importer dynamisk i en .web.tsx-fil for å unngå
  RN-bundle).
- Native: react-native-maps med markers per node.

Skriv en cross-platform PickupMap-komponent i components/checkout/.
Bruk Platform.select for å velge implementasjon.
```

---

## 8. Cron-jobber

```
Følgende skal kjøres automatisk:

- release-expired-reservations: hvert 30. sek
- evaluate-pickup-windows: hvert 5. min

Konfigurer pg_cron i Supabase ved å kjøre i ny migration 0006_cron.sql:

select cron.schedule('release-expired-reservations', '*/30 * * * * *',
  $$ select public.release_expired_reservations(); $$);

select cron.schedule('evaluate-pickup-windows', '*/5 * * * *',
  $$ select net.http_post(
       url := current_setting('app.functions_url') || '/evaluate-pickup-windows',
       headers := jsonb_build_object('Authorization', 'Bearer '||current_setting('app.cron_token'))
     ); $$);

(Sett app.functions_url og app.cron_token via supabase secrets.)
```

---

## 9. Tester

```
Det er ingen tester ennå. Bygg:

1. SQL-tester med pgTAP for reserve_order, confirm_order_paid,
   release_expired_reservations, evaluate_pickup_window.
   Plassering: supabase/tests/business_logic.sql

2. Edge function-tester med Deno.test for create-order, verify-pickup.
   Plassering: supabase/functions/<name>/test.ts

3. E2E-test med Playwright for hele kunde-flow:
   login → velg drop → legg til varer → checkout → mock Vipps →
   se ordre med QR.
   Plassering: apps/nobel-drop/tests/e2e/

Kjør alle i CI (GitHub Actions). Sett opp .github/workflows/ci.yml.
```

---

## 10. Deployment

```
Sett opp produksjon:

1. Supabase Cloud:
   supabase link --project-ref <ref>
   supabase db push
   supabase secrets set --env-file .env.production
   supabase functions deploy

2. Vercel for web:
   - Connect repo, sett root til apps/nobel-drop
   - Build command: npm run build:web
   - Output: dist
   - Sett alle EXPO_PUBLIC_*-variabler i Vercel env

3. EAS for mobile (når klart):
   eas build:configure
   eas build --platform all --profile production

4. Domener:
   - Web: nobeldrop.no → Vercel
   - API/Functions: <ref>.supabase.co (auto)
   - Universal links: legg til assetlinks.json (Android) og
     apple-app-site-association (iOS) til Vercel public/.well-known/

5. Konfigurer Vipps webhook-URL hos Vipps:
   https://<ref>.supabase.co/functions/v1/vipps-webhook

6. Konfigurer Stripe webhook hos Stripe Dashboard:
   https://<ref>.supabase.co/functions/v1/stripe-webhook
   Velg events: payment_intent.succeeded, payment_intent.payment_failed
   Lagre signing secret i STRIPE_WEBHOOK_SECRET.
```

---

## 11. Konvertering web → app (når MVP er stabil)

```
Når du er klar for native:

1. eas init  (lager EAS-prosjekt, oppdaterer app.json projectId)
2. Generer iOS/Android-prosjekter:
   npx expo prebuild
   (Dette skaper ios/ og android/ — ikke commit dem hvis du vil ha
   ren expo-managed flow.)
3. Test lokalt:
   eas build --profile development --platform ios
4. App Store / Play Store:
   eas build --profile production --platform all
   eas submit

Hele app/-mappen fungerer som den er. Eneste tilpasninger:
- Erstatt expo-web-browser redirect for Vipps med deep-link til
  Vipps-appen (Vipps åpner via vipps:// scheme automatisk).
- Native push-flow (se prompt 6).
- Apple Pay native (se prompt 2).

Ingen rewrites. Samme komponenter, samme styling, samme datalag.
```

---

## 12. Sikkerhets-checklist før go-live

```
Be Claude Code gå gjennom:

1. Verifiser at alle skriving til orders, drops, drop_items, payment_intents
   skjer via SECURITY DEFINER-funksjoner eller service_role i edge functions.
2. Bekreft RLS er PÅ for alle tabeller (sjekk 0002_rls_policies.sql).
3. Verifiser at ingen edge function logger PICKUP_QR_SECRET,
   STRIPE_SECRET, eller VIPPS_CLIENT_SECRET.
4. Test at create-order respekterer minimum-ordre.
5. Test at reserve_order er race-safe (kjør 100 parallelle requests
   mot et drop med 10 units → forventet: 10 reserved, 90 insufficient_units).
6. Sjekk at QR-token har TTL (utløp etter pickup-vinduet) — fix det
   ved å legge til timestamp-sjekk i verifyPickupToken med max 8 timer.
7. Rate-limit create-order per user_id (10/min) i edge function.
8. Aktiver Supabase Auth captcha for signup (dashboard → Auth → Settings).
```

---

## Tips for produktiv jobbing i Cursor

- **Last hele kontekst først:** "Les hele apps/nobel-drop/app/(customer)/" før du ber om endringer.
- **Bruk `@filename`** i Cursor for å peke på en spesifikk fil.
- **Hold endringer atomiske:** be om én logisk feature av gangen.
- **Verifiser etterpå:** "Vis meg diff-en og forklar hva du endret" før du aksepterer.
- **Hvis Cursor er usikker:** be den lese `PROJECT_BRIEF.md` på nytt — der ligger fasiten.

Lykke til med Nobel Drop. 🥐
