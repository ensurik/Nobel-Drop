# 09 — Varsler: web push, native push, e-post

> Det som lar Nobel Drop trigge handling. Push-varselet når et drop er live er hele FOMO-mekanikken — uten varsler er knapphet usynlig.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 3.9 og 5 (send-drop-notification).
Les LINI/00-context.md.
Les supabase/functions/send-drop-notification/index.ts.
Les apps/nobel-drop/lib/push.ts og apps/nobel-drop/public/sw.js.

Bygg ut komplett varsel-stack: web push (VAPID), native push (Expo), og e-post-fallback.

═════════════════════════════════════════════════════════
DEL A — Web push (VAPID)
═════════════════════════════════════════════════════════

1. Generer VAPID-nøkler:
   - Kjør: npx web-push generate-vapid-keys
   - Lagre VAPID_PUBLIC_KEY (legg som EXPO_PUBLIC_VAPID_PUBLIC_KEY i .env.local) og VAPID_PRIVATE_KEY (legg som secret i .env.production)
   - Sett VAPID_SUBJECT=mailto:noreply@nobeldrop.no

2. Registrer-flyt (apps/nobel-drop/lib/push.ts):
   - registerWebPush() er allerede skissert; verifiser at den:
     - Sjekker permission via Notification.permission
     - Hvis 'default': spør først via en custom UI-prompt (ikke bare browser-popup) — viser hvorfor
     - Når granted: subscribe med PushManager.subscribe + VAPID-key
     - Upsert i push_subscriptions med platform='web', endpoint, keys
   - Vis prompt på Account-siden + 1 gang etter første ordre (rett etter QR-pass vises)

3. Service worker (apps/nobel-drop/public/sw.js):
   - Verifisér at sw.js håndterer push-event:
     ```js
     self.addEventListener('push', (e) => {
       const data = e.data.json();
       e.waitUntil(self.registration.showNotification(data.title, {
         body: data.body,
         icon: '/icon-192.png',
         badge: '/badge-72.png',
         data: { url: data.url, drop_id: data.drop_id },
         requireInteraction: false,
         tag: data.drop_id,  // erstatter tidligere varsel for samme drop
       }));
     });
     self.addEventListener('notificationclick', (e) => {
       e.notification.close();
       e.waitUntil(clients.openWindow(e.notification.data.url));
     });
     ```

═════════════════════════════════════════════════════════
DEL B — Native push (Expo Notifications)
═════════════════════════════════════════════════════════

1. Konfigurasjon:
   - I app.json under expo.plugins, legg til:
     [
       "expo-notifications",
       { "icon": "./assets/notification-icon.png", "color": "#C8A24C" }
     ]
   - eas init for å få et projectId (om ikke gjort)
   - Sett opp APNs hos Apple Developer + last opp til Expo (eas credentials)
   - Sett opp FCM Server Key + last opp til Expo

2. Registrer-flyt (apps/nobel-drop/lib/push.ts):
   - Implementér registerNativePush():
     ```ts
     import * as Notifications from 'expo-notifications';
     import Constants from 'expo-constants';
     
     export async function registerNativePush(userId: string) {
       if (Platform.OS === 'web') return;
       const { status: existing } = await Notifications.getPermissionsAsync();
       let finalStatus = existing;
       if (existing !== 'granted') {
         const { status } = await Notifications.requestPermissionsAsync();
         finalStatus = status;
       }
       if (finalStatus !== 'granted') return;
       const projectId = Constants.expoConfig?.extra?.eas?.projectId;
       const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
       await supabase.from('push_subscriptions').upsert({
         user_id: userId,
         platform: Platform.OS as 'ios' | 'android',
         expo_token: tokenData.data,
       });
     }
     ```
   - Kall fra _layout.tsx etter auth, samme sted som registerWebPush

3. Foreground-handling:
   - Legg til Notifications.setNotificationHandler i _layout.tsx:
     ```ts
     Notifications.setNotificationHandler({
       handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true }),
     });
     ```

═════════════════════════════════════════════════════════
DEL C — Send-drop-notification edge function
═════════════════════════════════════════════════════════

1. Gjør funksjonen multi-channel:
   - Input: { drop_id, audience: 'all' | 'has_credit' | 'last_30days' }
   - Hent alle push_subscriptions for målgruppen
   - For platform='web': bruk web-push (npm:web-push fra esm.sh) til å sende til endpoint med VAPID
   - For platform='ios'/'android': POST til Expo Push API (https://exp.host/--/api/v2/push/send) med expo_token
   - Begge returnerer recipt-id; logg til audit_log

2. Drops auto-varsel ved status='live':
   - Lag trigger på drops-tabellen:
     - Når status går fra 'scheduled' til 'live', kall edge function via pg_net.http_post
   - Eller: cron-jobb hvert minutt som ser etter nye 'live'-drops og sender varsler

3. Innhold-templating:
   - Lag funksjon build_drop_notification_payload(drop_id) som returnerer:
     - title: drop.name
     - body: drop.hype_copy
     - url: app.nobeldrop.no/drop/{slug}
     - data: { drop_id, slug }

═════════════════════════════════════════════════════════
DEL D — E-post (fallback for de som ikke har push)
═════════════════════════════════════════════════════════

1. Sett opp Postmark eller Resend (anbefales Resend — enklere):
   - RESEND_API_KEY i secrets
   - From: hei@nobeldrop.no (krever DNS-verifisering)

2. Lag edge function send-drop-email som sender til alle profiles med marketing_consent=true OG som ikke har aktiv push.

═════════════════════════════════════════════════════════
DEL E — Transactional varsler (ikke marketing)
═════════════════════════════════════════════════════════

Push-varsler ved:
- Bestilling bekreftet (ordrenummer + henteinfo)
- Vinduet ditt er bekreftet (eller avlyst med refund-info)
- "Det er X minutter igjen til hentingen din"
- "Vi tok deg imot — takk for at du kom"

Hver er en kort funksjon som kalles fra relevante triggere/edge functions.

Lag/oppdater filer:
- apps/nobel-drop/lib/push.ts (utvid både web og native)
- apps/nobel-drop/app/_layout.tsx (registrer push, sett notification handler)
- apps/nobel-drop/public/sw.js (verifiser handlers)
- apps/nobel-drop/app/(customer)/account.tsx (push-toggle)
- apps/nobel-drop/app.json (expo-notifications plugin)
- supabase/functions/send-drop-notification/index.ts (multi-channel)
- supabase/functions/send-transactional-notification/index.ts (ny — for status-endringer)
- supabase/functions/send-drop-email/index.ts (ny — Resend)
- supabase/migrations/0015_drop_status_push_trigger.sql

Verifiser:
- Web: gi permission, motta varsel når drop går live
- Native: build via EAS, motta varsel på fysisk device
- E-post: brukere uten push får e-post i stedet
- Transaksjonelle varsler trigger ved status-endring (paid → confirmed → cancelled)
```

---

## Acceptance criteria

- [ ] Web push fungerer på Chrome + Safari (Mac)
- [ ] Native push fungerer på fysisk iOS + Android device via EAS dev build
- [ ] send-drop-notification ruter riktig per platform per bruker
- [ ] E-post-fallback for brukere uten aktiv push
- [ ] Transaksjonelle varsler trigger på alle status-endringer

---

## Begrensninger / kjente issues

- iOS Safari støtter web push fra og med iOS 16.4 — installeres som PWA først (Add to Home Screen). Vurder å vise en native instruksjon for iOS-Safari-brukere.
- Expo go kan ikke teste push — kreves dev build via EAS
