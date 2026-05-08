# 07 — Admin-dashboard: drop-wizard, ordre-overvåkning, KPI-er

> Operasjons-grensesnittet. Bygges som web-first (Platform.OS === 'web') i samme codebase, men gated bak `(admin)/` route group + role='admin'.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 6.1 (admin-tre).
Les Nobel.pdf side 12 (Ett miljø, alle muligheter) og 20 (Økonomisk arkitektur).
Les LINI/00-context.md.
Les CURSOR.md prompt #4 (drop-wizard).
Les apps/nobel-drop/app/(admin)/index.tsx, drops/index.tsx, drops/new.tsx, drops/[id].tsx, orders.tsx, nodes.tsx, windows.tsx.

Bygg ut hele admin-portalen.

═════════════════════════════════════════════════════════
DEL A — KPI-dashboard (app/(admin)/index.tsx)
═════════════════════════════════════════════════════════

Tre rader med tiles:

Rad 1 — I dag:
- Live drops nå (telling)
- Bestillinger i dag
- Brutto omsetning i dag
- Sold-out rate (% drops i dag som ble utsolgt)

Rad 2 — Siste 7 dager:
- Trend-graf for daglige bestillinger (bruk recharts eller victory-native)
- Snitt-AOV
- Topp-3 bestselgende drop_items
- Refusjon-rate

Rad 3 — Operasjon:
- Vinduer som venter på cutoff (med min/reserved tall)
- Ordrer som ikke er hentet (status=paid, slot.ends_at < now())
- Drivers aktive i dag

Hver tile er en `<KPITile>`-komponent (ny). Verdier hentes via en KPI-RPC-funksjon.

Lag SECURITY DEFINER funksjon get_admin_kpis() i 0011_admin_kpis.sql som returnerer alle disse i én jsonb-respons.

═════════════════════════════════════════════════════════
DEL B — Drop-wizard (app/(admin)/drops/new.tsx)
═════════════════════════════════════════════════════════

Multi-step form med react-hook-form + zod-validering:

Steg 1 — Grunnleggende:
- name (str, 3-80)
- slug (auto-generert fra name, redigerbar)
- starts_at (datetime, > now)
- ends_at (datetime, > starts_at, max 7 dager etter)
- total_units (int, 10-1000)
- hype_copy (text, 10-200)
- cover_image: opplasting til Supabase Storage bucket 'drop-images'

Steg 2 — Produkter:
- List alle products gruppert per category
- Per valgt produkt:
  - role: hero / addon / order_lifter (radio)
  - price_ore (input i kr, konverteres til ore)
  - available_units (input)
  - display_order (drag-handle eller numerisk)
- Validering: nøyaktig 1 hero, minst 2 addons, minst 1 order_lifter

Steg 3 — Pickup-vinduer:
- Multi-select av aktive nodes
- For hver valgt node: starts_at + min_volume_required
- Forhåndsvis: hvor mange slots som vil bli generert per node (alltid 3)

Steg 4 — Bekreft:
- Sammendrag av alt
- "Opprett som utkast" eller "Opprett og scheduler"
- Trigger create_drop_with_items_and_windows(p_drop, p_items, p_windows) — atomisk transaksjon i 0012_create_drop_atomic.sql

═════════════════════════════════════════════════════════
DEL C — Drop-detalj (app/(admin)/drops/[id].tsx)
═════════════════════════════════════════════════════════

- Header: navn, status, edit-knapp (kun draft/scheduled)
- Live tab: ordre-feed med real-time subscription
- Stats tab: units sold per item, conversion-grafer, peak-tid
- Vinduer tab: liste over windows med actions (avlys, varsle)
- Actions:
  - "Push nå" → kaller send-drop-notification
  - "Avlys hele dropet" (kun draft/scheduled, refunderer alle)

═════════════════════════════════════════════════════════
DEL D — Ordre-overvåkning (app/(admin)/orders.tsx)
═════════════════════════════════════════════════════════

- Tabell med søk (kunde, drop, status, dato-rekkevidde)
- Realtime-subscription på orders for live-feed
- Klikk på en ordre → modal med:
  - Full detalj
  - Knapp "Refunder denne ordren" → modal for begrunnelse → kaller refund-order edge function
  - Knapp "Manuell kreditt" → input for beløp + grunn → adjust_credit_manual SQL-funksjon

═════════════════════════════════════════════════════════
DEL E — Nodes (app/(admin)/nodes.tsx) og Windows (windows.tsx)
═════════════════════════════════════════════════════════

Bruk SECURITY DEFINER-funksjonene fra 05-pickup-nodes.md.
Vis volum-meter, tid til cutoff, actions.

═════════════════════════════════════════════════════════
DEL F — Layout og navigasjon
═════════════════════════════════════════════════════════

- (admin)/_layout.tsx skal være sidebar-basert på web (Platform.OS='web')
- På mobil: tabs nederst
- Sidebar-items: Dashboard, Drops, Ordrer, Nodes, Vinduer, Kunder, Innstillinger

Lag/oppdater filer:
- supabase/migrations/0011_admin_kpis.sql
- supabase/migrations/0012_create_drop_atomic.sql
- supabase/migrations/0013_admin_actions.sql (refund_order_admin, adjust_credit_manual)
- supabase/functions/refund-order/index.ts (ny)
- apps/nobel-drop/app/(admin)/_layout.tsx (utvid med sidebar)
- apps/nobel-drop/app/(admin)/index.tsx (KPI-dashboard)
- apps/nobel-drop/app/(admin)/drops/new.tsx (full wizard)
- apps/nobel-drop/app/(admin)/drops/[id].tsx (drop-detalj med tabs)
- apps/nobel-drop/app/(admin)/orders.tsx (full tabell)
- apps/nobel-drop/app/(admin)/nodes.tsx (CRUD-form)
- apps/nobel-drop/app/(admin)/windows.tsx (volum-meter + actions)
- apps/nobel-drop/components/admin/KPITile.tsx (ny)
- apps/nobel-drop/components/admin/StatusBadge.tsx (ny)

Verifiser:
- E2E: admin logger inn, ser dashboard, oppretter et drop via wizard, sjekker drop-detalj, opprater status til 'scheduled', verifiserer i SQL
- Refundering av en ordre fra admin trigger faktisk refusjon hos provider og oppdaterer credits_ledger
```

---

## Acceptance criteria

- [ ] Drop-wizard atomisk: feil i siste steg ruller tilbake alt
- [ ] KPI-tiles loader under 500ms
- [ ] Realtime-feed på orders viser nye bestillinger uten refresh
- [ ] Refund-knapp fra admin trigger ekte refusjon hos provider
- [ ] Sidebar fungerer på web; tabs på mobile

---

## Designnotater

- Admin er web-first og kan være tettere/mer dataintensiv enn customer
- Bruk samme tema (NativeWind dark + gold) for konsistens
- Tabeller bruker react-table eller TanStack Table på web
