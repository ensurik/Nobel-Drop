# 01 — Auth og roller

> Polér auth-flyten, sett opp roller robust, og verifiser at RLS faktisk gjør jobben sin per rolle.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.1, 4 og 6.1. Les LINI/00-context.md.
Les apps/nobel-drop/lib/auth.tsx, apps/nobel-drop/app/_layout.tsx,
apps/nobel-drop/app/auth/login.tsx, apps/nobel-drop/app/auth/callback.tsx,
supabase/migrations/0001_initial_schema.sql og 0002_rls_policies.sql.

Bygg ut auth + roller slik:

1. Magic link UX:
   - Login-skjermen skal håndtere: feil epost, sendt-bekreftelse, "sjekk inboxen"-state, og "send på nytt"-knapp med 60s cooldown.
   - Callback-siden skal verifisere session-token i URL-en, sette sesjon, og redirecte basert på profile.role.

2. Profil-trigger:
   - Lag migration 0005_profile_trigger.sql som setter opp en trigger på auth.users INSERT som auto-oppretter en rad i public.profiles med email kopiert over og role='customer'.
   - Verifiser via SQL-test at en ny auth-bruker får en profil-rad.

3. Rolle-skifte (admin only):
   - Lag en SECURITY DEFINER SQL-funksjon update_user_role(p_user_id uuid, p_role text) som krever at caller er admin (sjekk via auth.jwt() ->> 'role' eller mot profiles-tabellen).
   - Eksponér via en edge function admin-set-role som kun service_role kan kalle, og som først verifiserer at calleren (via JWT) er admin.

4. RLS-verifisering:
   - Skriv en pgTAP-testfil supabase/tests/rls_roles.sql som verifiserer at:
     - En customer kan SELECT kun sin egen profil og sine egne ordrer
     - En admin kan SELECT alt
     - En driver kan SELECT ordrer på sine tilordnede pickup_window_id (legg til pickup_windows.driver_id i samme migration hvis ikke der)
     - service_role kan ALT
   - Kjør med supabase test db.

5. Captcha for signup:
   - Aktiver hCaptcha eller Cloudflare Turnstile i Supabase Auth dashboard.
   - Legg til captcha-token i login-skjermen via @hcaptcha/react-hcaptcha eller native equivalent.

6. Universal links / deep links for callback:
   - Sett opp Expo deep-link config i app.json (allerede har scheme: 'nobeldrop')
   - For native: legg til 'expo-linking' og parse magic-link callback URL.
   - For web: callback-route er allerede korrekt; verifiser at den fanger session-fragmentene fra URL.

Lag/oppdater filer:
- supabase/migrations/0005_profile_trigger.sql
- supabase/functions/admin-set-role/index.ts
- supabase/tests/rls_roles.sql
- apps/nobel-drop/app/auth/login.tsx (oppgradér)
- apps/nobel-drop/app/auth/callback.tsx (oppgradér)
- apps/nobel-drop/lib/auth.tsx (utvid med rolle-cache)

Verifiser:
- npx expo start --web → login med ny epost → magic link mottas → callback redirecter til /(customer)/
- I Supabase Studio: oppgradér en bruker til admin via update_user_role-funksjonen → callback redirecter til /(admin)/
- supabase test db viser grønne checks på rls_roles.sql
```

---

## Acceptance criteria

- [ ] Ny bruker via magic link får automatisk profile-rad med role='customer'
- [ ] Admin kan promovere annen bruker til admin/driver via funksjonen — ikke direkte UPDATE fra klient
- [ ] RLS-tester passerer for alle tre roller
- [ ] Login UX viser tydelige states (sender, sendt, feil, cooldown)
- [ ] Captcha er aktiv på signup (ikke på login)
- [ ] Deep-link callback fungerer på web (verifisert) — native flagges som "skal testes når EAS build kjøres"

---

## Hva som ikke er en del av denne prompten

- Native push-registrering (kommer i `09-notifications.md`)
- Vipps Login som alternativ til magic link (avansert, kan komme senere)
- 2FA / passordbasert login (matcher ikke premium-friksjonsfri-flyt)
