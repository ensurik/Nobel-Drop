# 11 — Cron-jobber og bakgrunnsoppgaver

> Alle de periodiske oppgavene som holder systemet konsistent — frigjør utgåtte reservasjoner, evaluerer pickup-vinduer, utløper kreditt, evt. transition-statuser.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.5, 3.6, 3.7 og CURSOR.md prompt #8.
Les LINI/00-context.md.
Les supabase/functions/release-expired-reservations (lag den hvis ikke finnes — basert på 0003_business_functions.sql).
Les supabase/functions/evaluate-pickup-windows/index.ts.

Sett opp pg_cron med riktige intervaller, og verifiser at alle bakgrunnsjobber er idempotente og loggføres.

1. Aktiver pg_cron:
   - Lag migration 0019_enable_pg_cron.sql:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
     CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
     ```

2. Sett app-konfig for kron-tilgang til edge functions:
   - I Supabase Dashboard → Database → Settings → Custom config:
     - app.functions_url = 'https://<ref>.supabase.co/functions/v1'
     - app.cron_token = '<random base64 secret>'
   - Sett samme cron_token i edge function-secrets, og la edge functions verifisere
     `if (req.headers.get('authorization') !== `Bearer ${Deno.env.get('CRON_TOKEN')}`) return 401`

3. Schedulering:
   - Lag migration 0020_cron_schedule.sql:
     ```sql
     -- Frigjør utgåtte reservasjoner hvert 30. sekund (DB-funksjon, intern)
     SELECT cron.schedule(
       'release-expired-reservations',
       '*/30 * * * * *',
       $$ SELECT public.release_expired_reservations(); $$
     );

     -- Evaluer pickup-vinduer hvert 5. minutt (edge function via pg_net)
     SELECT cron.schedule(
       'evaluate-pickup-windows',
       '*/5 * * * *',
       $$
         SELECT net.http_post(
           url := current_setting('app.functions_url') || '/evaluate-pickup-windows',
           headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_token'),
                                          'Content-Type', 'application/json'),
           body := '{}'::jsonb
         );
       $$
     );

     -- Utløp gamle kreditter daglig kl. 02:00 (DB-funksjon)
     SELECT cron.schedule(
       'expire-old-credits',
       '0 2 * * *',
       $$ SELECT public.expire_old_credits(); $$
     );

     -- Drop status-transisjoner hvert minutt (DB-funksjon basert på now())
     SELECT cron.schedule(
       'drop-status-transitions',
       '* * * * *',
       $$ SELECT public.process_drop_status_transitions(); $$
     );
     ```

4. Status-transisjons-funksjon:
   - Lag SECURITY DEFINER funksjon process_drop_status_transitions():
     - UPDATE drops SET status='live' WHERE status='scheduled' AND now() >= starts_at
     - UPDATE drops SET status='closed' WHERE status='live' AND now() >= ends_at
     - UPDATE drops SET status='sold_out' WHERE status='live' AND units_sold >= total_units
     - For hver UPDATE: INSERT til audit_log

5. Send live-varsel når drop går live:
   - I process_drop_status_transitions(), når status går scheduled→live:
     - Kall send-drop-notification edge function via pg_net
     - Verifiser at audience='all' eller per drop-config

6. Idempotency på kron:
   - Cron kan kjøre flere ganger samtidig hvis forrige er treg.
   - I release_expired_reservations: bruk SELECT ... FOR UPDATE SKIP LOCKED slik at to parallelle kall ikke prøver samme rad.
   - I evaluate-pickup-windows: hvert window-update er allerede atomisk via UPDATE WHERE status='open'.

7. Cron-monitorering:
   - cron.job_run_details viser logg. Lag en admin-side for å se siste 100 kjøringer:
     - apps/nobel-drop/app/(admin)/cron.tsx (eller bake inn i KPI-dashboard)
   - Hvis en jobb feiler 3 ganger på rad: send admin-varsel på e-post

Lag/oppdater filer:
- supabase/migrations/0019_enable_pg_cron.sql
- supabase/migrations/0020_cron_schedule.sql
- supabase/migrations/0021_drop_status_transitions_function.sql
- supabase/functions/release-expired-reservations/index.ts (hvis ikke finnes — minimal, bare kaller DB-funksjon)
- supabase/functions/evaluate-pickup-windows/index.ts (verifiser CRON_TOKEN-validering)
- apps/nobel-drop/app/(admin)/cron.tsx (ny — viser cron.job_run_details)

Verifiser:
- I Supabase Studio: SELECT * FROM cron.job — viser alle 4 jobber
- Vent 30 sek, verifiser at expired reservations frigjøres (ny test-ordre, ikke betal, sjekk at status går til 'cancelled')
- Verifiser at evaluate-pickup-windows kjører (sjekk audit_log for evaluation-event)
- I admin-cron-siden: se job_run_details fra siste timer
```

---

## Acceptance criteria

- [ ] pg_cron er aktivert og 4 jobber er schedulert
- [ ] Alle edge function-kron krever CRON_TOKEN
- [ ] release-expired-reservations bruker SKIP LOCKED for trygg parallelisering
- [ ] Status-transisjoner skjer innen 1 minutt etter terskel
- [ ] Admin kan se cron-historikk

---

## Hvis pg_cron ikke er tilgjengelig (f.eks. lokalt)

Bruk Supabase Edge Functions Scheduler (kommer i Supabase) eller en ekstern scheduler som GitHub Actions cron som kaller dine edge functions. Mindre elegant — bruk pg_cron i prod.
