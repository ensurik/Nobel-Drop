# Nobel Drop

> *Premium D2C-infrastruktur for konditori. Forhåndsbetalt, drop-basert, datadrevet rute- og pickup-mekanikk.*

Ett kodebase som kjører som webapp i dag og som ekte iOS/Android-app etter `eas build`. Backend er Supabase (Postgres + Auth + Edge Functions + Realtime + Storage).

📘 **Start her:** [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — full teknisk arkitektur, datamodell, RLS, edge functions.
🛠 **Bygg videre:** [`CURSOR.md`](./CURSOR.md) — eksakte prompts for Claude Code i Cursor for å fylle inn det som er stubb.

---

## Stack

```
Frontend  : Expo 51 + React Native Web + Expo Router (file-based)
Styling   : NativeWind (Tailwind for RN) + custom Nobel-tema (mørk + gull)
State     : @tanstack/react-query + React Context
Backend   : Supabase (Postgres 15, Auth, Edge Functions, Realtime)
Payments  : Vipps eCom v2, Stripe (Apple Pay), Klarna Payments
Push      : Web Push (VAPID) + Expo Notifications
Type      : Strict TypeScript, delte typer i packages/types
```

## Mappestruktur

```
nobel-drop/
├── PROJECT_BRIEF.md              # ← les denne først
├── CURSOR.md                     # ← prompts å gi Claude Code i Cursor
├── README.md
├── package.json                  # workspaces
├── apps/nobel-drop/              # Expo-appen (web + native)
│   ├── app/                      # Expo Router (filer = ruter)
│   │   ├── (customer)/           # Kunde-flyt: hjem, drop, checkout, ordrer
│   │   ├── (admin)/              # Admin-dashboard
│   │   ├── (pickup)/             # Sjåfør/pickup-grensesnitt med QR-skanner
│   │   └── auth/                 # Magic-link login
│   ├── components/               # UI-komponenter (cross-platform)
│   ├── lib/                      # supabase, auth, api, cart, theme
│   ├── public/sw.js              # Service worker for web push
│   ├── app.json
│   ├── babel.config.js
│   ├── metro.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── packages/types/               # delte TypeScript-typer
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_initial_schema.sql
    │   ├── 0002_rls_policies.sql
    │   ├── 0003_business_functions.sql
    │   └── 0004_seed_data.sql
    └── functions/                # Edge Functions (Deno)
        ├── _shared/
        ├── create-order/
        ├── vipps-create-payment/
        ├── vipps-webhook/
        ├── stripe-create-intent/
        ├── stripe-webhook/
        ├── klarna-create-session/
        ├── klarna-webhook/
        ├── verify-pickup/
        ├── evaluate-pickup-windows/
        └── send-drop-notification/
```

---

## Kom i gang (lokalt)

### 1. Installer verktøy
```bash
# Node 20+, npm
npm i -g supabase eas-cli expo
```

### 2. Klon og installer
```bash
git clone <repo> nobel-drop && cd nobel-drop
npm install
```

### 3. Kjør Supabase lokalt
```bash
supabase start
supabase db reset      # kjører migrations + seed
```

### 4. Sett miljøvariabler
```bash
cp .env.example .env.production
cp apps/nobel-drop/.env.example apps/nobel-drop/.env.local
# Fyll inn nøkler. For lokal dev: kopier de tre Supabase-verdiene
# (URL, anon key, service role key) fra `supabase status`.
```

### 5. Deploy edge functions lokalt
```bash
supabase secrets set --env-file .env.production
supabase functions serve --no-verify-jwt   # for hot reload
# eller per-function:
supabase functions serve create-order
```

### 6. Start Expo (web)
```bash
cd apps/nobel-drop
npm run web
# Åpner http://localhost:8081 — fungerer som webapp.
```

### 7. Lag deg admin
I Supabase Studio (`http://localhost:54323`):
```sql
update public.profiles set role='admin' where email='deg@example.com';
```

---

## Deploy til produksjon

| Lag | Hvor | Hvordan |
| --- | --- | --- |
| Database + Auth | Supabase Cloud | `supabase link --project-ref <ref>` → `supabase db push` |
| Edge Functions | Supabase Cloud | `supabase functions deploy --project-ref <ref>` |
| Frontend (web) | Vercel | `expo export -p web` → deploy `dist/` |
| Frontend (iOS/Android) | EAS Build | `eas build --platform ios` |

Sjekk ende-til-ende oppsett i `CURSOR.md` (Setup-prompt).

---

## Forretningsregler (kjernen)

- **100 % forhåndsbetalt** — ingen produksjon før Vipps/Stripe/Klarna har bekreftet betaling.
- **Drop-knapphet** — `total_units` per drop, `available_units` per drop_item. Atomisk reservering i `reserve_order()`-funksjonen.
- **Pickup-vinduer**: 90 minutter, delt i 30-min slots, maks 10 kunder per slot.
- **Minimum-volum per node**: hvis ikke nådd ved cutoff (T-12 t), refunderes alle ordrer på den noden automatisk via `evaluate-pickup-windows`.
- **Nobel-kreditt** (ikke rabatt):
  - Subtotal ≥ 1000 kr → 10 % kreditt
  - Subtotal ≥ 1500 kr → 15 % kreditt
  - Subtotal ≥ 2000 kr → 20 % kreditt
  - Utløper etter 90 dager.
- **Minimumsordre**: 396 kr (1 × 4-pack signaturmakron).

Alle reglene er implementert i `supabase/migrations/0003_business_functions.sql` (atomisk SQL) — endre dem der hvis pris-stiger eller cutoff endres.

---

## Lisens

Privat. © Nobel Drop / MA Apps AS.
