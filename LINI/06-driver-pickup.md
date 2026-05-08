# 06 — Driver-app: dagens manifest, QR-skanner, real-time

> Sjåfør-flyt for å hente boksene fra kjøkkenet, kjøre ruta, og levere til kunder med QR-skanning. Lever på samme codebase som customer-app — bare gated bak `(pickup)`-route group + role='driver'.

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 6.1, 8 og 9.
Les LINI/00-context.md.
Les apps/nobel-drop/app/(pickup)/_layout.tsx, index.tsx, scan.tsx.
Les supabase/functions/verify-pickup/index.ts.
Les supabase/functions/_shared/qr.ts.

Bygg ut driver-flyten til produksjonsklar.

1. Driver dashboard (app/(pickup)/index.tsx):
   - Header viser dagens dato + sjåførens navn
   - Liste over dagens vinduer (pickup_windows der starts_at::date = current_date AND driver_id = auth.uid())
   - Per vindu: node-navn, adresse (med "Åpne i Maps"-knapp), tid, antall ordrer reservert/confirmed
   - Klikk på vindu → manifest-side

2. Manifest per vindu (ny rute app/(pickup)/window/[id].tsx):
   - Hent alle ordrer for vindu_id, gruppert per slot (0-30 / 30-60 / 60-90 min)
   - Per ordre: kunde-navn (hvis tillatt) eller bare ordre-id, items-liste, status-badge
   - "Skann"-knapp som åpner QR-scanner
   - Realtime-subscription på orders WHERE pickup_window_id=$id

3. QR-skanner (app/(pickup)/scan.tsx):
   - Bruk expo-camera CameraView med onBarcodeScanned
   - Native: kameraet starter når skjermen er fokusert
   - Web: bruk getUserMedia + en JS QR-decoder (jsQR via dynamic import for web-only)
   - Når QR oppdages, kall verify-pickup edge function med token
   - Vis suksess-overlay (grønn check + ordrenavn + items) i 4 sekunder, deretter klar for neste skann
   - Vis feil-overlay (rød + årsak) hvis token ugyldig, ordren allerede hentet, eller feil vindu

4. verify-pickup edge function:
   - Verifisér HMAC-signaturen på token (PICKUP_QR_SECRET)
   - Sjekk at:
     - order.status = 'paid' OR 'confirmed' (ikke 'picked_up' allerede)
     - pickup_window.status = 'confirmed'
     - now() innenfor pickup_slot.starts_at - 5min til pickup_slot.ends_at + 15min (toleranse)
     - Caller har role='driver' OG (pickup_window.driver_id = caller_id ELLER admin)
   - Sett order.status='picked_up', picked_up_at=now(), picked_up_by=caller_id
   - Returner { ok: true, order: { id, customer_first_name, items: [{ name, qty }] } }
   - Logg til audit_log

5. Token TTL:
   - Legg til timestamp-sjekk i verifyPickupToken: token må være signert mindre enn 8 timer før pickup_slot.starts_at
   - Hvis utløpt, returner specific error 'token_expired' og foreslå at sjåfør kontakter kunde

6. Off-line manifest:
   - Cache dagens manifest i AsyncStorage ved fokus
   - Hvis nettverk dør: vis cached liste + warning "Offline — skanninger lagres og synkes når nett kommer tilbake"
   - Lokal kø av skanninger som retries når connected
   (Kan utsettes til v2 hvis tid er knapt — flagg som todo)

7. Sjåfør-roller:
   - For å bli driver: admin oppretter en bruker, kaller update_user_role(uid, 'driver')
   - Driver-konto bør ha eget passord (ikke magic link) — vurder å legge til password-auth for kun driver-rollen i en senere prompt

Lag/oppdater filer:
- apps/nobel-drop/app/(pickup)/index.tsx (utvid med dagens vinduer)
- apps/nobel-drop/app/(pickup)/window/[id].tsx (ny)
- apps/nobel-drop/app/(pickup)/scan.tsx (utvid med solide success/error states)
- apps/nobel-drop/components/pickup/ManifestRow.tsx (polér)
- supabase/functions/verify-pickup/index.ts (legg til TTL + driver-windowsjekk)
- supabase/functions/_shared/qr.ts (legg til TTL i sign + verify)

Verifiser:
- Manuell test: opprett admin → opprett driver-konto → admin tilordner driver til et window → driver logger inn, ser dagens manifest, åpner skanner, skanner en QR fra customer-ordren → ordren markeres picked_up i begge appene real-time
- Skanning av samme QR igjen → "allerede hentet"-feil
- Skanning utenfor TTL → "token utløpt"-feil
```

---

## Acceptance criteria

- [ ] Driver ser kun sine egne vinduer per dag
- [ ] QR-skanning fungerer på native og web (med fallback)
- [ ] verify-pickup avviser ugyldige, dupliserte, og utløpte token
- [ ] Order status oppdateres real-time i customer-appen idet driver skanner
- [ ] Audit-log inneholder hver skanning med driver_id + timestamp

---

## Avhengigheter

- `01-auth-and-roles.md` for driver-rolle-skifte
- `12-realtime-and-analytics.md` for ordre-status-subscription
