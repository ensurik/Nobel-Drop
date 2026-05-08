# 14 — Deployment: Supabase Cloud, app.nobeldrop.no, native apps

> Fra lokal utvikling til produksjon — Supabase Cloud-prosjekt, web-deploy til app.nobeldrop.no, og EAS-build for iOS/Android.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 11 (Fra web til app) og CURSOR.md prompt #10.
Les LINI/00-context.md.
Les .github/workflows/deploy.yml (eksisterende — deployer marketing til /public_html/ og web-app til /public_html/shop.nobeldrop.no/).

Sett opp produksjon ende-til-ende.

═════════════════════════════════════════════════════════
DEL A — Supabase Cloud-prosjekt
═════════════════════════════════════════════════════════

1. Opprett prosjekt:
   - https://supabase.com → New project
   - Region: eu-north-1 (Stockholm) for lavest latency Norge
   - Lagre prosjekt-ref og connection string

2. Link og push:
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push   # kjører alle migrations 0001-00xx
   ```

3. Sett alle secrets:
   ```bash
   supabase secrets set --env-file .env.production
   # Inneholder: PICKUP_QR_SECRET, VIPPS_*, STRIPE_*, KLARNA_*, VAPID_*, RESEND_API_KEY, EXPO_ACCESS_TOKEN, CRON_TOKEN
   ```

4. Deploy edge functions:
   ```bash
   supabase functions deploy
   # Eller per funksjon hvis du vil teste enkeltvis
   ```

5. Aktivér realtime og storage:
   - Dashboard → Database → Replication → Aktivér på drops, drop_items, orders, pickup_*
   - Dashboard → Storage → Opprett bucket 'drop-images' (public read)

6. Sett app.functions_url og app.cron_token i Custom config (jfr 11-cron-and-jobs.md).

═════════════════════════════════════════════════════════
DEL B — Endre app-URL fra shop til app.nobeldrop.no
═════════════════════════════════════════════════════════

1. Dedia / DNS-oppsett:
   - Lag CNAME: app.nobeldrop.no → samme target som shop.nobeldrop.no (eller flytt FTP-mappen)
   - Aktiver SSL hos Dedia for app-subdomenet

2. Oppdatér deploy-workflow:
   - .github/workflows/deploy.yml → endre server-dir for deploy-app jobben fra `/public_html/shop.nobeldrop.no/` til `/public_html/app.nobeldrop.no/`
   - Endre EXPO_PUBLIC_APP_URL fra https://shop.nobeldrop.no til https://app.nobeldrop.no

3. Oppdatér marketing CTA-er:
   - apps/nobel-marketing/src/components/Header.astro
   - apps/nobel-marketing/src/components/Footer.astro
   - apps/nobel-marketing/src/components/CTABand.astro
   - apps/nobel-marketing/src/layouts/BaseLayout.astro
   - alle pages/*.astro
   - Bytt alle https://shop.nobeldrop.no → https://app.nobeldrop.no

4. Sett opp redirect fra gammelt subdomene:
   - I /public_html/shop.nobeldrop.no/.htaccess: redirect 301 til https://app.nobeldrop.no$1

═════════════════════════════════════════════════════════
DEL C — Native build via EAS
═════════════════════════════════════════════════════════

1. Init:
   ```bash
   cd apps/nobel-drop
   npm install -g eas-cli
   eas login
   eas init   # genererer projectId, oppdaterer app.json
   eas build:configure
   ```

2. eas.json profiles:
   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal"
       },
       "production": {}
     },
     "submit": { "production": {} }
   }
   ```

3. Bygg dev-build for testing:
   ```bash
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```
   Installer på fysisk device for å teste push-varsler og kamera.

4. Produksjons-build:
   ```bash
   eas build --profile production --platform all
   ```

5. App Store / Play Store:
   - iOS: krever Apple Developer Program ($99/år), App Store Connect-konto, App Privacy-erklæring
   - Android: krever Google Play Console ($25 engang)
   - eas submit --platform all etter første build

═════════════════════════════════════════════════════════
DEL D — Universal links og deep links
═════════════════════════════════════════════════════════

1. iOS Universal Links:
   - Last opp /public_html/.well-known/apple-app-site-association:
     ```json
     { "applinks": { "apps": [], "details": [{
       "appID": "<TEAM_ID>.no.nobeldrop.app",
       "paths": ["*"]
     }]}}
     ```
   - I app.json: ios.associatedDomains: ["applinks:nobeldrop.no", "applinks:app.nobeldrop.no"]

2. Android App Links:
   - Last opp /public_html/.well-known/assetlinks.json:
     ```json
     [{
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "no.nobeldrop.app",
         "sha256_cert_fingerprints": ["<from EAS credentials>"]
       }
     }]
     ```

3. Test deep linking:
   - https://app.nobeldrop.no/drop/test-slug skal åpne appen direkte hvis installert
   - Magic-link callback: https://app.nobeldrop.no/auth/callback skal åpne i app

═════════════════════════════════════════════════════════
DEL E — Push-credentials til Expo
═════════════════════════════════════════════════════════

1. iOS APNs:
   - Apple Developer → Certificates → APNs Key (P8) — last opp til Expo:
     `eas credentials --platform ios → APNs key → upload`

2. Android FCM:
   - Firebase Console → Project Settings → Cloud Messaging → Server Key (Legacy) eller Service Account
   - `eas credentials --platform android → FCM API → upload`

3. Verifiser:
   - Etter neste prod-build, send push via send-drop-notification — verifiser at fysisk device mottar.

═════════════════════════════════════════════════════════
DEL F — Monitoring og uptime
═════════════════════════════════════════════════════════

1. Supabase Cloud:
   - Dashboard → Logs Explorer → lagre saved queries for: webhook errors, edge function 5xx, kron-feil
   - Sett opp Slack-varsel hvis ønskelig

2. Eksternt:
   - UptimeRobot eller BetterStack på app.nobeldrop.no/health (lag minimal /health-route som returnerer 200)
   - Sentry eller LogRocket for frontend-errors (valgfritt nivå 1)

Lag/oppdater filer:
- .github/workflows/deploy.yml (endre subdomene)
- apps/nobel-marketing/src/* (URL-replace shop → app)
- /public_html/.well-known/apple-app-site-association
- /public_html/.well-known/assetlinks.json
- /public_html/shop.nobeldrop.no/.htaccess (redirect til app)
- apps/nobel-drop/eas.json (lag hvis ikke finnes)
- apps/nobel-drop/app.json (oppdatér associatedDomains)
- docs/deployment.md (sjekkliste)

Verifiser:
- supabase db push viser 'Up to date'
- supabase functions list viser alle deployet
- nobeldrop.no rendrer marketing
- app.nobeldrop.no rendrer customer-app, login fungerer
- Native dev-build kjører på fysisk device, kan logge inn
- Push-varsler mottas på iOS og Android device
```

---

## Acceptance criteria

- [ ] Supabase Cloud-prosjekt er live i eu-north-1
- [ ] Alle migrations + functions er deployet
- [ ] app.nobeldrop.no serverer Expo-appen
- [ ] iOS + Android dev-builds installert på fysisk device, fungerer
- [ ] Universal links åpner appen fra https://app.nobeldrop.no/...
- [ ] Push-varsler mottas på fysiske devices

---

## Hva som ikke er en del av denne prompten

- Marketing-side er allerede deployet (gjort tidligere) — ingenting å gjøre der
- App Store / Play Store-publisering — egen prompt når MVP er stabil
