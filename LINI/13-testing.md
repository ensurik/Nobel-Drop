# 13 — Testing: pgTAP, Deno.test, Playwright, CI

> Beskytter forretningsregler mot regresjoner. Spesielt kritisk: race-safety i reserve_order, refund-flyt, og kreditt-tier-beregning.

---

## Prompt

```
Les PROJECT_BRIEF.md hele.
Les LINI/00-context.md.
Les supabase/migrations/0003_business_functions.sql.
Les supabase/functions/create-order/index.ts og verify-pickup/index.ts.

Bygg et komplett test-setup på tre nivåer:
SQL (pgTAP), Edge function (Deno.test), E2E (Playwright).
Sett opp GitHub Actions CI som kjører alt på hver PR.

═════════════════════════════════════════════════════════
DEL A — pgTAP (SQL-tester)
═════════════════════════════════════════════════════════

1. Aktiver pgTAP:
   - Lag migration 0024_enable_pgtap.sql:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
     ```

2. Test-mappe:
   supabase/tests/
     business_logic.sql        # reserve_order, confirm_order_paid, refund_pickup_window
     credits.sql               # tier-beregning, expire-jobb
     race_conditions.sql       # parallelle kall mot reserve_order
     rls_roles.sql             # tilgangskontroll per rolle
     window_evaluation.sql     # evaluate-pickup-windows logic
     drop_status.sql           # status-transisjoner

3. Eksempel — reserve_order race:
   ```sql
   BEGIN;
   SELECT plan(3);

   -- Setup
   INSERT INTO drops (id, name, slug, starts_at, ends_at, total_units)
     VALUES ('00000000-0000-0000-0000-000000000001', 'Test', 'test', now() - interval '1 hour', now() + interval '1 hour', 10);
   -- ... opprett items, slot, etc

   -- Spawn 100 parallelle reserve_order via pg_background eller multiple BEGIN-blokker
   -- (forenklet: bruk en LOOP og verifiser at units_sold ikke overstiger 10)

   SELECT is(units_sold, 10, 'Exactly 10 units sold')
   FROM drops WHERE id = '00000000-0000-0000-0000-000000000001';

   SELECT * FROM finish();
   ROLLBACK;
   ```

4. Kjør lokalt:
   - supabase test db
   - Skal vise grønne checks for alle .sql-filer i tests/

═════════════════════════════════════════════════════════
DEL B — Deno.test (Edge function-tester)
═════════════════════════════════════════════════════════

1. Per edge function, lag test.ts ved siden av index.ts:
   supabase/functions/create-order/test.ts
   supabase/functions/vipps-webhook/test.ts
   supabase/functions/verify-pickup/test.ts
   supabase/functions/_shared/qr.test.ts

2. Eksempel — qr.test.ts:
   ```ts
   import { signPickupToken, verifyPickupToken } from "./qr.ts";
   import { assertEquals, assertRejects } from "https://deno.land/std/assert/mod.ts";

   Deno.test("signPickupToken + verifyPickupToken round-trip", async () => {
     const orderId = "abc-123";
     const secret = "test-secret-32-bytes-minimum-length";
     const token = await signPickupToken(orderId, secret);
     const decoded = await verifyPickupToken(token, secret);
     assertEquals(decoded.order_id, orderId);
   });

   Deno.test("verifyPickupToken rejects tampered tokens", async () => {
     const token = await signPickupToken("abc", "secret");
     const tampered = token.slice(0, -2) + "XX";
     await assertRejects(() => verifyPickupToken(tampered, "secret"));
   });
   ```

3. Test webhook-signaturer:
   - vipps-webhook/test.ts: send med riktig HMAC → 200, send med feil HMAC → 401
   - stripe-webhook/test.ts: bruk stripe.webhooks.signature.generateTestHeaderString
   - klarna-webhook/test.ts: send med riktig basic auth → 200, feil → 401

4. Kjør lokalt:
   - cd supabase/functions && deno test --allow-all

═════════════════════════════════════════════════════════
DEL C — Playwright e2e
═════════════════════════════════════════════════════════

1. Setup:
   - I apps/nobel-drop/ kjør: npm install -D @playwright/test
   - npx playwright install chromium webkit
   - playwright.config.ts pekes til webServer som kjører expo start --web

2. Test-suite — apps/nobel-drop/tests/e2e/:
   customer-flow.spec.ts:
     - Login med magic link (mock via supabase.auth.signInWithIdToken med en pre-generert)
     - Naviger til drop, legg til items, gå til checkout
     - Velg slot, mock Vipps-redirect (intercept request og returner suksess-payload)
     - Verifiser at ordre vises med QR i orders-listen
   admin-flow.spec.ts:
     - Login som admin
     - Opprett et drop via wizard
     - Verifiser at det vises i drops-listen med status='draft'
   pickup-flow.spec.ts:
     - Login som driver
     - Se dagens manifest
     - Mock QR-skanning → verifiser at ordre status går til 'picked_up'

3. Mock Supabase:
   - For e2e bruker vi en lokal Supabase-instans (supabase start)
   - playwright global-setup.ts kjører supabase db reset for ren state per test-run
   - Test-data seedes via en fixtures.sql

═════════════════════════════════════════════════════════
DEL D — GitHub Actions CI
═════════════════════════════════════════════════════════

1. Workflow .github/workflows/ci.yml:
   ```yaml
   name: CI
   on: [pull_request]
   jobs:
     sql-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: supabase/setup-cli@v1
         - run: supabase start
         - run: supabase test db
     deno-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: denoland/setup-deno@v1
         - run: cd supabase/functions && deno test --allow-all
     e2e-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - uses: supabase/setup-cli@v1
         - run: supabase start
         - run: npm ci
         - run: npx playwright install --with-deps chromium webkit
         - run: cd apps/nobel-drop && npx playwright test
   ```

2. Status-badges i README.md.

Lag/oppdater filer:
- supabase/migrations/0024_enable_pgtap.sql
- supabase/tests/business_logic.sql
- supabase/tests/credits.sql
- supabase/tests/race_conditions.sql
- supabase/tests/rls_roles.sql
- supabase/tests/window_evaluation.sql
- supabase/tests/drop_status.sql
- supabase/functions/_shared/qr.test.ts
- supabase/functions/create-order/test.ts
- supabase/functions/vipps-webhook/test.ts
- supabase/functions/stripe-webhook/test.ts
- supabase/functions/klarna-webhook/test.ts
- supabase/functions/verify-pickup/test.ts
- apps/nobel-drop/playwright.config.ts
- apps/nobel-drop/tests/e2e/customer-flow.spec.ts
- apps/nobel-drop/tests/e2e/admin-flow.spec.ts
- apps/nobel-drop/tests/e2e/pickup-flow.spec.ts
- apps/nobel-drop/tests/fixtures/seed.sql
- .github/workflows/ci.yml

Verifiser:
- supabase test db lokalt → alle grønne
- deno test --allow-all → alle grønne
- npx playwright test → alle grønne
- Push en PR → CI kjører og rapporterer status
```

---

## Acceptance criteria

- [ ] Race-test passerer (10 av 100 reserveringer lykkes på 10-units drop)
- [ ] Webhook-tester avviser ugyldige signaturer
- [ ] E2E customer flow fullføres ende-til-ende med mock-betaling
- [ ] CI grønn på alle tre jobs

---

## Hva som ikke er en del av denne prompten

- Belastningstesting (k6/artillery) — egen prompt hvis vi ser behov
- Visuell regresjon (Percy/Chromatic) — overkill nå
