# LINI — Prompt-pakken til Nobel Drop backend

> Hver fil i denne mappen er en **selvstendig prompt** som kan kopieres inn i Claude Code i Cursor (eller annen agent) for å bygge ut én konkret del av Nobel Drop-systemet. De er designet for å bli kjørt i nummerert rekkefølge, men kan også plukkes enkeltvis hvis du allerede vet hva som mangler.

Mål: et fullstendig backend + sluttbrukersystem deployet på **app.nobeldrop.no** som matcher visjonen i `Nobel.pdf` og spesifikasjonen i `PROJECT_BRIEF.md`.

---

## Hvordan bruke disse promptene

1. **Åpne hele prosjektet i Cursor** (eller annen IDE med Claude Code).
2. Begynn alltid med å la Claude lese `PROJECT_BRIEF.md` og `00-context.md`.
3. **Kopier én prompt om gangen** inn i Claude Code (Cmd/Ctrl + L).
4. La Claude jobbe seg ferdig med én oppgave før du går videre. Verifiser med "Vis meg diff" før du aksepterer.
5. Etter hver fullført prompt: kjør den foreslåtte verifikasjonen før du går videre.

---

## Rekkefølge

### Fundament (kjør først)
- `00-context.md` — Hva som finnes, hva som mangler. Les denne først.
- `01-auth-and-roles.md` — Brukere, profiler, roller, magic-link
- `02-drop-engine.md` — Drops, atomisk reservasjon, FOMO-stat

### Kunde-opplevelse
- `03-customer-flow.md` — Hjem, drop-detalj, kurv, ordre-liste, QR
- `04-payments.md` — Vipps + Stripe Apple Pay + Klarna full handshake
- `09-notifications.md` — Web push + Expo native push + email-fallback
- `10-credits-and-tiers.md` — Nobel-kreditt-stigen, utløp, ledger

### Operasjon
- `05-pickup-nodes.md` — Noder, vinduer, slots, etterspørsels-aktivering
- `06-driver-pickup.md` — Sjåfør-app, manifest, QR-skanner
- `07-admin-dashboard.md` — Drop-wizard, ordre-overvåkning, KPI-er
- `08-area-voting.md` — Stemme-system fra marketing → backend → ny node

### Plattform
- `11-cron-and-jobs.md` — pg_cron for utgåtte reservasjoner, vindu-evaluering
- `12-realtime-and-analytics.md` — Live drop-counters, hendelses-logging
- `13-testing.md` — pgTAP, Deno.test, Playwright e2e, CI
- `14-deployment.md` — Supabase Cloud, EAS native, app.nobeldrop.no
- `15-security-checklist.md` — RLS-audit, race-test, rate-limit, secrets

---

## Forventet sluttilstand

Når alle promptene er kjørt, skal du ha:

- **app.nobeldrop.no** — Ekte web-app + native iOS/Android-build via EAS, alle tre betalingsmetoder live, push-varsler aktive, atomisk drop-engine, QR-pickup
- **Admin-portal** — Drop-wizard, ordre-overvåkning, KPI-dashboard, refusjon-håndtering, kunde-oppslag
- **Sjåfør-app** — Daglig manifest, QR-skanner, real-time ordre-statuser
- **Backend** — Supabase Cloud med pg_cron, edge functions, RLS, audit-log
- **Marketing → app-integrasjon** — Stemme-skjemaet på `nobeldrop.no` lagrer til database og driver node-aktivering
- **Kvalitet** — Tester på SQL/edge/e2e-nivå, sikkerhets-audit godkjent

---

## Forhold til eksisterende mapper

| Mappe | Status | Promptenes rolle |
|---|---|---|
| `supabase/migrations/` | Skjema + RLS + business functions er der | Promptene bygger ut kron-jobber, voting-tabell, ekstra business functions |
| `supabase/functions/` | Skall finnes for alle | Promptene fyller inn signaturverifisering, idempotency, full handshake |
| `apps/nobel-drop/` | Expo-app, customer-flyt fungerer, admin/pickup er stubs | Promptene fyller inn drop-wizard, scanner-flow, dashboard, push |
| `apps/nobel-marketing/` | Astro marketing site, ferdig | Promptene knytter "stem frem ditt område"-skjemaet til backend |
| `Gabriel/` | Notater fra deg | Ikke rør — promptene leser fra PROJECT_BRIEF.md i stedet |

---

## Et viktig prinsipp

**Hver prompt skal kjøres med konteksten i mente.** Begynn alltid med:

> Les `PROJECT_BRIEF.md` seksjon X. Les `LINI/00-context.md`. Les filene jeg refererer til. Bekreft at du forstår nåværende tilstand før du foreslår noe.

Det er den eneste måten å unngå at agenten dupliserer arbeid eller bryter eksisterende invariants.
