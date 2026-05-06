Jeg har et komplett scaffold for Nobel Drop i denne mappen. Før du gjør NOEN endringer, gjør følgende i denne rekkefølgen:

1. Les disse tre filene i sin helhet:
   - PROJECT_BRIEF.md (full teknisk arkitektur — fasit for alt)
   - README.md (oppsett og stack)
   - CURSOR.md (prompt-bok for utvidelser)

2. Gi meg en kort statusrapport (maks 10 linjer) som svarer på:
   - Hvilken stack er valgt og hvorfor passer den til web→app-konvertering?
   - Hvor ligger forretningslogikken (atomisk reservering, kreditt-tier, refund-mekanikk)?
   - Hvilke 3 ting blokkerer meg fra å kjøre prosjektet lokalt akkurat nå?

3. IKKE skriv kode ennå. Vent på min bekreftelse før du fortsetter.

Når jeg sier "kjør oppsett", utfør i denne rekkefølgen og stopp ved første feil:
   a. npm install (i rot)
   b. Sjekk om Supabase CLI og Docker er installert; hvis ikke, gi meg eksakt kommando for min OS
   c. supabase start
   d. supabase db reset (kjører migrations 0001-0004 + seed)
   e. Kopier .env.example → .env.production OG apps/nobel-drop/.env.example → apps/nobel-drop/.env.local. Fyll inn de tre verdiene fra `supabase status` (URL, anon key, service role key). Vis meg hva du fyller inn.
   f. cd apps/nobel-drop && npm run web
   g. Verifiser at http://localhost:8081 rendrer login-skjermen.

Etter oppsett kjøres dette manuelle steget av meg (ikke deg):
   - Logg inn med epost (magic link)
   - I Supabase Studio: UPDATE public.profiles SET role='admin' WHERE email='min@epost.no';

Når jeg har bekreftet at appen kjører og jeg er admin, vent på min neste instruksjon. Ikke begynn å bygge ut features uoppfordret.