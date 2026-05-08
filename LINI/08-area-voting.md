# 08 — Stem frem ditt område: marketing → backend

> Knytter "Stem frem ditt område"-skjemaet på `nobeldrop.no` til en backend som lagrer stemmer, viser admin et heatmap, og foreslår nye nodes når et område passerer en terskel.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 8 og 12 (Fra web til app) og Nobel.pdf side 14-16.
Les LINI/00-context.md.
Les apps/nobel-marketing/src/pages/index.astro (seksjonen "Stem frem ditt område").
Les apps/nobel-drop/app/(admin)/nodes.tsx.

Bygg ut stemme-systemet end-to-end.

1. Datamodell:
   - Lag migration 0014_area_votes.sql:
     ```sql
     CREATE TABLE area_votes (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       area_input text NOT NULL,            -- rå input fra bruker, f.eks. "Sandefjord sentrum"
       normalized_area text,                 -- normalisert via geocoding, f.eks. "Sandefjord"
       lat numeric(9,6),
       lng numeric(9,6),
       email text,                           -- valgfritt, hvis brukeren ga den
       user_agent text,
       ip_hash text,                         -- SHA256(ip + salt) for å begrense duplikater uten å lagre IP
       created_at timestamptz DEFAULT now()
     );
     CREATE INDEX area_votes_normalized ON area_votes(normalized_area);
     CREATE INDEX area_votes_created ON area_votes(created_at DESC);
     ```
   - RLS: kun service_role kan SELECT/INSERT. Admin kan SELECT.

2. Submit-endpoint:
   - Lag edge function submit-area-vote i supabase/functions/submit-area-vote/index.ts:
     - Mottar { area, email? } via POST
     - Rate-limit: 3 per IP per 24t (bruk 04-payments shared rate-limit)
     - Geocode area → lat/lng + normalized_area via en gratis API (f.eks. Nominatim med User-Agent header, eller Photon)
     - Hash IP fra request headers via crypto.subtle.digest('SHA-256', ip + salt)
     - INSERT til area_votes
     - Returner { ok: true, normalized_area, votes_for_area: int }
   - Eksponér endpoint via verify_jwt=false i supabase/config.toml så det kan kalles uten innlogging.

3. Marketing-form integrasjon:
   - Erstatt mailto-formet i apps/nobel-marketing/src/pages/index.astro (seksjonen "Stem frem ditt område") med en ekte fetch til submit-area-vote.
   - Bygg form-state i en liten Astro-komponent VoteForm.astro med inline JS:
     - Input + button
     - Loading-state
     - Suksess-state: "Takk — XX andre har også stemt på YY. Vi varsler deg når et stopp aktiveres her."
     - Feil-state med reasonable melding
   - Fortsatt server-side rendret HTML, JS bare for submit-handler.

4. Admin: heatmap og forslag-til-node:
   - Ny rute apps/nobel-drop/app/(admin)/votes.tsx:
     - Tabell over normalized_area med vote-tellere, sortert etter count desc
     - "Threshold reached"-flagg når count >= 50 (configurable)
     - Klikk på et område → modal med:
       - Liste over individuelle stemmer (ip_hash truncated, email hvis gitt, dato)
       - Knapp "Foreslå som ny pickup-node" → pre-fyller create_pickup_node-form med navn=area, lat/lng fra første stemme

5. Auto-varsling når stopp aktiveres:
   - Når admin oppretter en ny pickup_node:
     - Edge function notify-area-voters(p_node_id) som finner alle area_votes hvor email er satt OG normalized_area matcher node.city innen 25km
     - Send mail til hver via Supabase Auth's email-sender, eller via Postmark/Resend om vi har det
     - Innhold: "Du stemte på X. Vi har nettopp åpnet et stopp i nærheten — første drop kommer snart."

6. Velkomst-tilbakestilling:
   - I forsidens VoteForm: hvis brukeren har stemt før (sjekk localStorage), erstatt skjemaet med "Du stemte på YY den ZZ. Følg med — vi prioriterer der det er flest stemmer."

Lag/oppdater filer:
- supabase/migrations/0014_area_votes.sql
- supabase/functions/submit-area-vote/index.ts
- supabase/functions/notify-area-voters/index.ts
- apps/nobel-marketing/src/components/VoteForm.astro (ny)
- apps/nobel-marketing/src/pages/index.astro (bytt mailto-form til VoteForm)
- apps/nobel-drop/app/(admin)/votes.tsx (ny)
- apps/nobel-drop/app/(admin)/_layout.tsx (legg til "Stemmer"-link)

Verifiser:
- Submit fra marketing-form → POST til edge function → verifiser i DB at row er der med normalized_area
- Rate-limit: 4. submit fra samme IP innen 24t returnerer 429
- Admin → /votes viser aktuelle stemmer
- Admin oppretter ny pickup-node fra et område med >50 stemmer → notify-area-voters trigges → e-poster sendes
```

---

## Acceptance criteria

- [ ] Marketing-form sender til submit-area-vote og lagrer i DB
- [ ] Geocoding normaliserer "Sandefjord sentrum", "sandefjord", "Sandefjord 3210" til samme `normalized_area`
- [ ] Admin ser stemme-heatmap og kan foreslå nye nodes
- [ ] Stemmegivere som har gitt e-post får varsel når deres område aktiveres
- [ ] Rate-limit hindrer spam (3 per IP per 24t)

---

## Avhengigheter

- `01-auth-and-roles.md` for admin-tilgang til /votes
- `04-payments.md` for shared rate-limit-hjelper
- `09-notifications.md` for e-post-sending (eller setup av Postmark/Resend separat)

---

## Off-the-shelf alternativer hvis du vil hoppe over backend-bygging

- **Tally.so** form med webhook → Supabase: enklere oppstart, men mister geocoding og admin-heatmap
- **Typeform** + Zapier til Supabase: samme begrensning
- Anbefalt: bygg dette ordentlig — det er en kjerne i forretningsmodellen
