# Nobel Drop — Teknisk Blueprint

> *"Nobel Drop er ikke en markedsføringskampanje. Det er en ny infrastruktur som forvandler eksisterende håndverkskvalitet til en datadrevet, høymargin D2C-kanal."*

Dette dokumentet er den fullstendige tekniske arkitekturen. Det er kilden til sannhet for alt som bygges i `apps/`, `supabase/` og `packages/`. Alt annet (kode, prompts, README) refererer hit.

---

## 1. Forretningsprinsipper som styrer arkitekturen

| Prinsipp | Konsekvens for systemet |
| --- | --- |
| 100 % forhåndsbetalt før produksjon | Ordre må gå gjennom payment intent før noen produksjonsdata genereres. Ordre uten payment_succeeded telles **ikke** mot drop-volum. |
| Faste pickup-vinduer på 90 min, 30-min sub-slots, maks 10 kunder per slot | Kapasitet håndheves atomisk på databasenivå (ingen overbooking). |
| Volumstyrt levering: minimum-volum per node ellers refusjon | Cron-jobb evaluerer node ved cutoff (T-12 t før vindu). Hvis under min → refunder alle ordrer på den noden eller tilby flytting. |
| Drops er knappe (FOMO) — `total_units`, "Kun 22 igjen", "Utsolgt på 14 min" | Reservering må være atomisk + telemetri (sold_at-tidsstempler) for å vise live-stats. |
| Nobel-kreditt, ikke prisavslag | Aldri rabatt på linje. Krediten er en separat ledger som genereres ved oppgjør og brukes som betalingsmiddel ved neste ordre. |
| Hero-produkt → kurv-byggere → ordreløftere | Kurv har strukturerte slots. Hero må være først, add-ons og ordreløftere ligger oppå. |
| Skalerbart uten faste utsalg — partner-noder | `pickup_nodes` har en `type` (`own_stop` / `partner`) som kun er metadata; logisk likt. |
| Konvertibel til app | Én Expo-kodebase, fil-basert routing, ingen DOM-spesifikke biblioteker i felles kode. |

---

## 2. Stack

```
Frontend  : Expo 51 + React Native Web + Expo Router (file-based routing)
Styling   : NativeWind (Tailwind for RN) + custom theme tokens
State     : React Query (TanStack) + React Context for auth
Backend   : Supabase (Postgres 15 + Auth + Storage + Edge Functions + Realtime)
Payments  : Vipps eCom v2, Stripe Payment Intents (Apple Pay), Klarna Payments
Push      : Web Push (VAPID) + Expo Notifications (delegert)
Hosting   : Vercel (web build via expo export -p web), Supabase Cloud
Mobile    : Senere — samme repo, eas build for iOS/Android
```

### Hvorfor Expo + RNW
- `app/`-mappen kompilerer til både `index.html`-routes (web) og `Stack`-navigator (native).
- React Native-komponenter (`<View>`, `<Text>`, `<Pressable>`) renderes som DOM på web og som ekte native-views på iOS/Android.
- Dag 1: `npx expo start --web` → fungerer som webapp. Dag N: `eas build` → ekte iOS/Android-app uten ny kodebase.

---

## 3. Datamodell

Alle tabeller bor i schema `public` med mindre annet er angitt. ID-er er `uuid` med `gen_random_uuid()`. Pengebeløp lagres som `bigint` i **øre** (NOK × 100) for å unngå flytetallsfeil.

### 3.1 Brukere & profil

```sql
-- profiles utvider auth.users (Supabase). Trigger oppretter rad ved signup.
profiles (
  id uuid PK references auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  full_name text,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer','admin','driver')),
  marketing_consent boolean DEFAULT false,
  push_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)
```

### 3.2 Produktkatalog

```sql
products (
  id uuid PK,
  slug text UNIQUE NOT NULL,         -- 'signatur-makron'
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN
    ('hero','addon','main_cake','dinner','seasonal')),
  base_price_ore bigint NOT NULL,    -- f.eks. 9900 = 99 kr
  image_url text,
  hero_image_url text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
)
```

`category` styrer hvor produktet kan tilbys i kurven (jfr. salgspyramiden).

### 3.3 Drops

```sql
drops (
  id uuid PK,
  name text NOT NULL,                -- 'Fredagsdrop uke 18'
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','live','sold_out','closed')),
  starts_at timestamptz NOT NULL,    -- når drop går live
  ends_at timestamptz NOT NULL,      -- siste salgsmulighet
  total_units int NOT NULL,          -- max bokser/enheter på drop totalt
  units_sold int NOT NULL DEFAULT 0,
  cover_image_url text,
  hype_copy text,                    -- 'Begrenset antall lansert'
  created_at timestamptz DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (units_sold <= total_units)
)
CREATE INDEX drops_status_starts ON drops(status, starts_at);
```

### 3.4 Drop items (produkter inkludert i drop)

```sql
drop_items (
  id uuid PK,
  drop_id uuid NOT NULL references drops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL references products(id),
  role text NOT NULL CHECK (role IN ('hero','addon','order_lifter')),
  price_ore bigint NOT NULL,         -- pris under drop (kan avvike fra base)
  available_units int NOT NULL,      -- maks per drop_item
  sold_units int NOT NULL DEFAULT 0,
  display_order int DEFAULT 0,
  UNIQUE(drop_id, product_id),
  CHECK (sold_units <= available_units)
)
```

### 3.5 Pickup-noder & vinduer

```sql
pickup_nodes (
  id uuid PK,
  name text NOT NULL,                -- 'Tønsberg sentrum'
  city text,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  type text NOT NULL CHECK (type IN ('own_stop','partner')),
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Ett 90-minutters stopp på en node for ett drop
pickup_windows (
  id uuid PK,
  drop_id uuid NOT NULL references drops(id) ON DELETE CASCADE,
  node_id uuid NOT NULL references pickup_nodes(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  min_volume_required int NOT NULL DEFAULT 0,  -- 0 = alltid OK
  reserved_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','locked','confirmed','cancelled_refund')),
  cutoff_at timestamptz NOT NULL,    -- når min-volum sjekkes
  UNIQUE(drop_id, node_id, starts_at),
  CHECK (ends_at - starts_at = interval '90 minutes')
)

-- 30-min slot innen et vindu, maks 10 kunder
pickup_slots (
  id uuid PK,
  window_id uuid NOT NULL references pickup_windows(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_customers int NOT NULL DEFAULT 10,
  reserved_count int NOT NULL DEFAULT 0,
  UNIQUE(window_id, starts_at),
  CHECK (ends_at - starts_at = interval '30 minutes'),
  CHECK (reserved_count <= max_customers)
)
```

Cutoff settes typisk til T-12 t. Hvis `reserved_count < min_volume_required` ved cutoff, settes `status='cancelled_refund'` og alle ordrer på vinduet refunderes (eller får valgmulighet om annen node).

### 3.6 Ordre

```sql
orders (
  id uuid PK,
  user_id uuid NOT NULL references profiles(id),
  drop_id uuid references drops(id),                 -- nullable for senere flow
  pickup_window_id uuid references pickup_windows(id),
  pickup_slot_id uuid references pickup_slots(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN
      ('pending','reserved','paid','confirmed','picked_up','refunded','cancelled')),
  subtotal_ore bigint NOT NULL,
  credit_applied_ore bigint NOT NULL DEFAULT 0,
  total_ore bigint NOT NULL,                          -- subtotal - credit_applied
  currency text NOT NULL DEFAULT 'NOK',
  payment_provider text CHECK (payment_provider IN ('vipps','stripe','klarna')),
  pickup_qr_token text UNIQUE,                        -- HMAC-signert, brukes i QR
  picked_up_at timestamptz,
  picked_up_by uuid references profiles(id),          -- driver
  reservation_expires_at timestamptz,                 -- 20 sek for å fullføre betaling
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  refund_reason text
)
CREATE INDEX orders_user ON orders(user_id);
CREATE INDEX orders_drop ON orders(drop_id);
CREATE INDEX orders_window ON orders(pickup_window_id);
CREATE INDEX orders_status ON orders(status) WHERE status IN ('pending','reserved');

order_items (
  id uuid PK,
  order_id uuid NOT NULL references orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL references products(id),
  drop_item_id uuid references drop_items(id),  -- nullable utenfor drop
  quantity int NOT NULL CHECK (quantity > 0),
  unit_price_ore bigint NOT NULL,
  line_total_ore bigint NOT NULL
)
```

**Reservasjonsmønster (kjernemekanikk):**
1. Klient kaller `create-order` edge function med items + valgt pickup_slot.
2. Funksjon kjører atomisk SQL `reserve_order(...)` som:
   - Låser drop-rad og drop_items med `SELECT ... FOR UPDATE`.
   - Sjekker `available_units - sold_units >= qty` per item.
   - Inkrementerer `sold_units`, `units_sold`, `pickup_slots.reserved_count`, `pickup_windows.reserved_count`.
   - Setter `orders.status='reserved'`, `reservation_expires_at = now() + 20 sec`.
3. Klient åpner Vipps/Stripe/Klarna med `payment_intent`.
4. Webhook ved suksess → `orders.status='paid'` + generer `pickup_qr_token`.
5. Cron eller separat job rydder utgåtte reservasjoner og frigjør units (`SELECT release_expired_reservations()`).

### 3.7 Nobel-kreditt (ledger)

```sql
credits_ledger (
  id uuid PK,
  user_id uuid NOT NULL references profiles(id),
  order_id uuid references orders(id),
  type text NOT NULL CHECK (type IN
    ('earned','spent','expired','manual_adjust','refund')),
  amount_ore bigint NOT NULL,        -- positiv (earned) eller negativ (spent)
  balance_after_ore bigint NOT NULL, -- løpende saldo for raske oppslag
  expires_at timestamptz,            -- earned utløper f.eks. 90 dager
  note text,
  created_at timestamptz DEFAULT now()
)
CREATE INDEX credits_user_created ON credits_ledger(user_id, created_at DESC);

-- Materialisert view eller tabell for raske saldosjekker
CREATE OR REPLACE VIEW user_credit_balances AS
SELECT user_id, SUM(amount_ore)::bigint AS balance_ore
FROM credits_ledger
WHERE (expires_at IS NULL OR expires_at > now())
GROUP BY user_id;
```

**Tier-logikk** (kjøres etter `paid`):
| Subtotal (kr) | Bonus | amount_ore (NOK) |
| --- | --- | --- |
| ≥ 1000 | 10 % Nobel-kreditt | `floor(subtotal_ore * 0.10)` |
| ≥ 1500 | 15 % | `floor(subtotal_ore * 0.15)` |
| ≥ 2000 | 20 % | `floor(subtotal_ore * 0.20)` |

Minimum-ordre på 396 kr (eller config-styrt) håndheves i `create-order`.

### 3.8 Betaling

```sql
payment_intents (
  id uuid PK,
  order_id uuid NOT NULL references orders(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('vipps','stripe','klarna')),
  provider_intent_id text,
  status text NOT NULL,  -- raw provider status
  amount_ore bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NOK',
  raw_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
CREATE INDEX payment_intents_order ON payment_intents(order_id);
CREATE INDEX payment_intents_provider_id ON payment_intents(provider, provider_intent_id);
```

Webhook-funksjonene gjør idempotent oppdatering basert på `provider + provider_intent_id`.

### 3.9 Push-tokens

```sql
push_subscriptions (
  id uuid PK,
  user_id uuid references profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web','ios','android')),
  endpoint text,                      -- web push endpoint URL
  p256dh text,                        -- web push key
  auth text,                          -- web push key
  expo_token text,                    -- native: ExponentPushToken[...]
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, COALESCE(endpoint, expo_token))
)
```

### 3.10 Audit-log

```sql
audit_log (
  id bigserial PK,
  actor_id uuid references profiles(id),
  action text NOT NULL,            -- 'drop.created', 'order.refunded', ...
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
)
```

---

## 4. RLS-policies (oppsummering)

| Tabell | Read | Write |
| --- | --- | --- |
| profiles | `auth.uid() = id` | self only; admin alle |
| products | public (kun `is_active`) | admin |
| drops | public (`status IN ('scheduled','live','sold_out','closed')`) | admin |
| drop_items | public (samme som drop) | admin |
| pickup_nodes | public (kun `is_active`) | admin |
| pickup_windows | public (kun aktive drops) | admin |
| pickup_slots | public (samme) | admin |
| orders | `auth.uid() = user_id`; admin alle; driver ser tilordnet pickup_window | service_role kun (skrives via edge functions) |
| order_items | gjennom orders | gjennom orders |
| credits_ledger | `auth.uid() = user_id` (read-only) | service_role |
| payment_intents | service_role | service_role |
| push_subscriptions | self | self insert/delete |
| audit_log | admin | service_role |

Alle skrivinger som krever invariant (drop-volum, slot-kapasitet, kreditt) går gjennom **edge functions med `service_role`**, ikke direkte fra klient.

---

## 5. Edge Functions (forretningslogikk)

Alle ligger under `supabase/functions/<navn>/index.ts` og deployes med `supabase functions deploy <navn>`.

| Function | Trigger | Ansvar |
| --- | --- | --- |
| `create-order` | klient (POST) | Atomisk reservasjon + payment intent. Kalles fra checkout. |
| `vipps-create-payment` | intern fra create-order | Initierer Vipps eCom payment, returnerer redirect URL. |
| `vipps-webhook` | Vipps callback | Oppdaterer payment_intent + order til `paid`, genererer QR-token, beregner og bokfører Nobel-kreditt. |
| `stripe-create-intent` | intern | Lager Stripe PaymentIntent for Apple Pay / kort, returnerer client_secret. |
| `stripe-webhook` | Stripe callback | Samme post-paid flow som Vipps. |
| `klarna-create-session` | intern | Lager Klarna payment session. |
| `klarna-webhook` | Klarna callback | Samme post-paid flow. |
| `verify-pickup` | sjåfør-skanner (POST QR-token) | Verifiserer HMAC, marker `picked_up`. Kun `driver`-rolle. |
| `evaluate-pickup-windows` | cron (hver time) | Ved cutoff: hvis `reserved_count < min_volume_required` → `cancelled_refund` + initier refunds. Ellers `confirmed`. |
| `release-expired-reservations` | cron (hvert 30 sek) | Frigjør units fra utgåtte ikke-betalte ordrer. |
| `send-drop-notification` | manuell + scheduled (når drop går `live`) | Sender push til alle brukere med `push_enabled=true`. |
| `compute-drop-stats` | klient (GET) | Returnerer `units_left`, `seconds_until_sold_out_estimate`, "kun X igjen". Kan også gjøres som DB-view. |

### Kritiske SQL-funksjoner (kalles fra edge functions)

```sql
-- Atomisk reservasjon. Returnerer order_id eller raiser exception.
CREATE OR REPLACE FUNCTION reserve_order(
  p_user_id uuid,
  p_drop_id uuid,
  p_pickup_slot_id uuid,
  p_items jsonb,            -- [{drop_item_id, quantity}]
  p_credit_to_apply_ore bigint
) RETURNS uuid AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Markerer ordre som betalt + genererer QR + bokfører kreditt
CREATE OR REPLACE FUNCTION confirm_order_paid(
  p_order_id uuid,
  p_provider text,
  p_provider_intent_id text
) RETURNS void AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Frigjør units fra utgåtte reservasjoner
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS int AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refund hele en pickup_window (og alle dens ordrer)
CREATE OR REPLACE FUNCTION refund_pickup_window(p_window_id uuid)
RETURNS int AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. Frontend-arkitektur

### 6.1 Routing-tre (Expo Router fil-basert)

```
app/
├── _layout.tsx                 # root: providers (Supabase, theme, query)
├── index.tsx                   # redirect basert på rolle
├── (customer)/
│   ├── _layout.tsx             # tab-bar: Hjem, Meny, Favoritter, Konto
│   ├── index.tsx               # Hjem: Drop-feed (Drop, Middag, Kake)
│   ├── drop/
│   │   └── [id].tsx            # Drop-detalj: hero + add-ons + countdown
│   ├── checkout.tsx            # Kurv → pickup-velger → betaling
│   ├── orders/
│   │   ├── index.tsx           # Ordreliste
│   │   └── [id].tsx            # QR-pass + status
│   └── account.tsx             # Profil, kreditt-saldo, push-instillinger
├── (admin)/
│   ├── _layout.tsx             # sidebar (web-optimisert)
│   ├── index.tsx               # KPI-dashboard
│   ├── drops/
│   │   ├── index.tsx           # Liste
│   │   ├── new.tsx             # Wizard
│   │   └── [id].tsx            # Detalj + items + windows
│   ├── orders.tsx
│   ├── nodes.tsx
│   └── windows.tsx             # Volum-meter per node, refund-trigger
├── (pickup)/
│   ├── _layout.tsx             # mobil-først, ingen tabs
│   ├── index.tsx               # Velg dagens stopp + se manifest
│   └── scan.tsx                # Kamera + QR-skanner
└── auth/
    ├── login.tsx               # email magic link / Vipps Login
    └── callback.tsx
```

### 6.2 Komponentbibliotek

`components/` inneholder kun cross-platform RN-komponenter:
- `ui/` — Button, Card, Sheet, Input (NativeWind).
- `drop/` — DropCard, CountdownTimer, ScarcityBar.
- `checkout/` — CartLine, PickupNodeMap, SlotPicker.
- `pickup/` — QRPass, ManifestRow.

Web-spesifikt (kart, kamera-fallback, push registrering) lever bak `*.web.tsx`-filer og lazy-loades.

### 6.3 Theming

Premium mørk-på-mørk med gull. Tokens definert i `lib/theme.ts`:

```ts
export const colors = {
  bg: '#0A0A0B',
  bgElevated: '#15151A',
  border: '#2A2A33',
  text: '#F5F2EA',
  textMuted: '#8E8B82',
  gold: '#C8A24C',
  goldBright: '#E8C57A',
  goldDim: '#7A6532',
  danger: '#D4503E',
  success: '#5BAE7A',
};

export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  body: 'Inter_400Regular',
  mono: 'JetBrainsMono_400Regular',
};
```

### 6.4 Datalag

`lib/api.ts` eksponerer funksjoner som er rene wrappers rundt Supabase:

```ts
export const api = {
  drops: {
    list: () => supabase.from('drops').select('*, drop_items(*)').eq('status','live'),
    byId: (id) => supabase.from('drops').select('*, drop_items(*, products(*))').eq('id', id).single(),
  },
  orders: {
    create: (payload) => supabase.functions.invoke('create-order', { body: payload }),
    mine: () => supabase.from('orders').select('*, order_items(*, products(*))').order('created_at', { ascending:false }),
  },
  pickup: {
    nodesForDrop: (dropId) =>
      supabase.from('pickup_windows')
        .select('*, pickup_nodes(*), pickup_slots(*)')
        .eq('drop_id', dropId),
  },
  credits: {
    balance: () => supabase.from('user_credit_balances').select('balance_ore').single(),
    history: () => supabase.from('credits_ledger').select('*').order('created_at',{ ascending:false }),
  },
};
```

React Query brukes for caching, invalidering ved realtime-events.

### 6.5 Realtime

Supabase Realtime brukes for:
- Drop-detalj: subscribe på `drop_items` for å vise live "kun X igjen"-stat.
- Admin: subscribe på `orders` for live-feed.
- Pickup: subscribe på `orders` for tilordnet vindu.

---

## 7. Kjøps-flyt (sekvensdiagram)

```
Kunde-app                Edge Fn               DB                Vipps
   │  POST /create-order   │                     │                 │
   │──────────────────────▶│                     │                 │
   │                       │  reserve_order()    │                 │
   │                       │────────────────────▶│                 │
   │                       │  ◀── order_id ──────│                 │
   │                       │  POST /vipps init   │                 │
   │                       │────────────────────────────────────▶│ │
   │                       │  ◀── redirect_url ───────────────── │
   │  ◀── url + order_id ──│                     │                 │
   │  redirect / open Vipps                                        │
   │  user betaler i Vipps                                         │
   │                       │  Vipps webhook      │                 │
   │                       │◀────────────────────────────────────│ │
   │                       │  confirm_order_paid()                 │
   │                       │────────────────────▶│                 │
   │                       │  generer QR + kreditt                 │
   │  realtime push: order paid                                    │
   │  ◀───────────────────────────────────────────│                │
```

Reserveringen utløper på 20 sek (eller hva config sier) — etter det frigjøres units.

---

## 8. Pickup-flyt (sjåfør)

1. Sjåfør logger inn (rolle = `driver`).
2. `(pickup)/index.tsx` viser dagens vinduer for sjåføren (admin tilordner via `pickup_windows.driver_id` — eller utlede fra rolle + alt for mvp).
3. Sjåfør velger vindu → ser manifest sortert per slot (0-30, 30-60, 60-90 min).
4. `(pickup)/scan.tsx` åpner kamera (web: `expo-camera` web-bygd; native: ekte kamera).
5. QR inneholder signert token (`HMAC_SHA256(order_id + secret)`). Sjåfør sender til `verify-pickup`.
6. Edge function verifiserer HMAC, sjekker at ordren er `paid` og at vinduet er `confirmed`, og setter `picked_up_at`.

---

## 9. Sikkerhet

- Alle write-paths går via `service_role` i edge functions (ingen direkte tabell-write fra anon).
- RLS er PÅ for alle tabeller.
- QR-token er HMAC-signert med `PICKUP_QR_SECRET` (env). Ingen DB-oppslag uten verifisert HMAC.
- Webhook-endepunkter validerer signatur:
  - Vipps: HMAC-SHA256 med subscription key.
  - Stripe: `stripe.webhooks.constructEvent` med signing secret.
  - Klarna: HTTP Basic Auth + signature.
- Rate-limiting på `create-order` (per user_id) for å hindre drop-bot abuse.
- Admin-rolle skiftes kun via service_role (ikke fra klient).

---

## 10. Miljøvariabler

`.env.example` (frontend, public):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_VAPID_PUBLIC_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_APP_URL=https://nobeldrop.no
```

`supabase/.env` (server-only, satt med `supabase secrets set`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PICKUP_QR_SECRET=                # langt random
VIPPS_CLIENT_ID=
VIPPS_CLIENT_SECRET=
VIPPS_SUBSCRIPTION_KEY=
VIPPS_MERCHANT_SERIAL_NUMBER=
VIPPS_BASE_URL=https://apitest.vipps.no
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
KLARNA_USERNAME=
KLARNA_PASSWORD=
KLARNA_BASE_URL=https://api.playground.klarna.com
VAPID_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
VAPID_SUBJECT=mailto:noreply@nobeldrop.no
EXPO_ACCESS_TOKEN=               # for å sende native push
```

---

## 11. Fra web til app — konverteringsplan

| Steg | Når | Hva må skje |
| --- | --- | --- |
| 1 | I dag | `npx expo start --web` kjører hele kunde-flyten i nettleser. |
| 2 | Etter pilot | `eas build --platform ios --profile development` — alt i `app/` fungerer. Eneste endring er `*.web.tsx`-overrides for kart og kamera (de native-versjonene bruker `react-native-maps` og `expo-camera`). |
| 3 | Apple Pay native | Stripe React Native SDK, samme `stripe-create-intent` edge function. |
| 4 | Push native | Bytt fra web push til Expo push tokens (`push_subscriptions.platform = 'ios'`). Edge function leverer til riktig kanal. |
| 5 | Vipps native | Vipps-appen åpner via deep link automatisk. |

Hele admin-grensesnittet trenger ikke å bli native — det kan være web-only (sjekk `Platform.OS === 'web'` i `(admin)/_layout.tsx`).

---

## 12. Hva som er bygd i V1 vs hva som står som stubb

**V1 ferdig kode:**
- Hele Supabase-skjema med RLS og atomiske SQL-funksjoner.
- `create-order`, `verify-pickup`, `evaluate-pickup-windows`, webhook-skjeletter for Vipps/Stripe/Klarna.
- Customer flow: hjem, drop-detalj, checkout-skall, ordreliste, QR-pass.
- Admin-skall: drops-liste, ordrer-liste, windows.
- Pickup-skall: manifest + scan.
- Theming, auth context, datalag.

**Stubb (CURSOR.md har eksakte prompts for å fylle inn):**
- Vipps/Stripe/Klarna full betalings-handshake med ekte sandbox-credentials.
- Web push subscription + serverside sender.
- Native build-konfig (`eas.json`, splash, ikoner).
- Kart-integrasjon (Mapbox/Google) — pickup-velger viser i V1 en liste-fallback.
- Tester (Vitest for SQL-funksjoner, Playwright for e2e).

---

## 13. Faser fra blueprint mapped til milepæler

| Fase | Blueprint | Tekniske milepæler |
| --- | --- | --- |
| 1: MVP & Lansering | Hype + kaker + første pickup-stopp | Customer flow, drop-engine, Vipps live, 1 node |
| 2: Iterasjon | Optimaliser kapasitet, ruter | Admin-stats per slot, A/B på add-ons, Stripe + Klarna |
| 3: Skalering | Middag + nye geografiske noder | `category='dinner'`-produkter aktiveres, partner-noder |

---

> Denne arkitekturen er bygd for å overleve fra MVP-pilot (1 node, 1 drop/uke) til full skalering (mange noder, flere drops/dag, native app). Ingen rewrites krevd underveis.
