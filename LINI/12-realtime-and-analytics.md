# 12 — Realtime og analytics

> Live-stats som driver FOMO ("kun X bokser igjen"), real-time admin-feed, og en lett analytics-tabell for å forstå hva som faktisk skjer i dropsene.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 6.5 (Realtime).
Les LINI/00-context.md.
Les apps/nobel-drop/app/(customer)/drop/[id].tsx og (admin)/orders.tsx.

Bygg ut realtime-flyt og legg til en lett analytics-event-stack.

═════════════════════════════════════════════════════════
DEL A — Realtime publikasjoner
═════════════════════════════════════════════════════════

1. Aktivér Realtime per tabell:
   - Lag migration 0022_realtime_publications.sql:
     ```sql
     ALTER PUBLICATION supabase_realtime ADD TABLE public.drops;
     ALTER PUBLICATION supabase_realtime ADD TABLE public.drop_items;
     ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
     ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_slots;
     ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_windows;
     ```

2. Customer drop-detalj subscription:
   - I apps/nobel-drop/app/(customer)/drop/[id].tsx:
     ```tsx
     useEffect(() => {
       const ch = supabase
         .channel(`drop:${id}`)
         .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drop_items', filter: `drop_id=eq.${id}` },
           () => queryClient.invalidateQueries({ queryKey: ['drop', id] }))
         .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drops', filter: `id=eq.${id}` },
           () => queryClient.invalidateQueries({ queryKey: ['drop', id] }))
         .subscribe();
       return () => { supabase.removeChannel(ch); };
     }, [id]);
     ```

3. Admin orders-feed:
   - I app/(admin)/orders.tsx, samme mønster på orders-tabellen, INSERT + UPDATE.

4. Driver manifest-feed:
   - I app/(pickup)/window/[id].tsx, subscribe på orders WHERE pickup_window_id=$id for å se nye reservasjoner og status-endringer.

═════════════════════════════════════════════════════════
DEL B — Analytics-events
═════════════════════════════════════════════════════════

1. Datamodell:
   - Lag migration 0023_analytics_events.sql:
     ```sql
     CREATE TABLE analytics_events (
       id bigserial PRIMARY KEY,
       user_id uuid REFERENCES profiles(id),
       session_id text,
       event_type text NOT NULL,        -- 'drop_view', 'add_to_cart', 'checkout_start', 'checkout_complete', 'push_received', 'push_clicked'
       drop_id uuid,
       payload jsonb,
       created_at timestamptz DEFAULT now()
     );
     CREATE INDEX analytics_events_type_created ON analytics_events(event_type, created_at DESC);
     CREATE INDEX analytics_events_drop ON analytics_events(drop_id, created_at DESC);
     CREATE INDEX analytics_events_session ON analytics_events(session_id, created_at);
     ```
   - RLS: kun service_role kan SELECT/INSERT. Admin kan SELECT.

2. Track-funksjon:
   - I apps/nobel-drop/lib/analytics.ts:
     ```ts
     const sessionId = (() => {
       const k = 'nobel-session-id';
       let v = sessionStorage.getItem(k);
       if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); }
       return v;
     })();

     export async function track(event_type: string, payload?: object) {
       await supabase.functions.invoke('log-event', {
         body: { event_type, session_id: sessionId, ...payload }
       });
     }
     ```
   - Native: bruk AsyncStorage istedenfor sessionStorage.
   - Edge function log-event er minimal — INSERT til analytics_events med user_id fra JWT.

3. Standard events å tracke:
   - drop_view: når en drop-detalj-side åpnes
   - add_to_cart: når item legges til
   - checkout_start: når "Bekreft og betal" trykkes
   - checkout_complete: etter webhook bekrefter (server-side i confirm_order_paid)
   - push_received: i sw.js / Notifications listener
   - push_clicked: når brukeren klikker varselet

4. Admin analytics-side:
   - apps/nobel-drop/app/(admin)/analytics.tsx:
     - Funnel: drop_view → add_to_cart → checkout_start → checkout_complete (med konvertering-rater)
     - Per-drop konvertering: hvilke drops konverterer best
     - Tidsbruk: median sek mellom drop_view og checkout_complete
     - Push-effekt: % som åpnet appen innen 10 min etter push_received

5. Compute-drop-velocity (allerede planlagt i 02):
   - Brukes også i admin for å vise "drop X solgte 50% av units i de første 10 minuttene"

Lag/oppdater filer:
- supabase/migrations/0022_realtime_publications.sql
- supabase/migrations/0023_analytics_events.sql
- supabase/functions/log-event/index.ts (ny)
- apps/nobel-drop/lib/analytics.ts (ny)
- apps/nobel-drop/app/(customer)/drop/[id].tsx (kall track + realtime sub)
- apps/nobel-drop/app/(customer)/checkout.tsx (kall track ved hvert steg)
- apps/nobel-drop/app/(admin)/orders.tsx (realtime sub)
- apps/nobel-drop/app/(admin)/analytics.tsx (ny — funnel-side)
- apps/nobel-drop/app/(pickup)/window/[id].tsx (realtime sub)
- apps/nobel-drop/public/sw.js (track push_received + push_clicked)

Verifiser:
- Åpne drop i to faner, bestill i én → andre fane viser ny units_left uten refresh
- I analytics-tabellen: events vises kort etter handling
- Admin-analytics-funnel viser realistiske tall etter noen test-ordrer
```

---

## Acceptance criteria

- [ ] Realtime-subscription oppdaterer customer drop-detalj uten refresh
- [ ] Admin orders-feed viser nye ordre live
- [ ] Analytics-events lagres for alle nøkkel-handlinger
- [ ] Funnel-visualisering i admin gir innsikt i konvertering

---

## Personvern-notat

- analytics_events lagrer `user_id` (kun for innloggede). For anonyme: bare session_id.
- Ingen IP, ingen User Agent — det er nok for funnel-analyse uten å bli tracker-tungt.
- Eldre enn 90 dager kan auto-slettes via en annen cron-jobb hvis ønsket (GDPR-vennlig).
