# 03 — Customer-flyt: hjem, drop, kurv, ordre, QR

> Polér kunde-opplevelsen fra første åpning av app.nobeldrop.no til QR-kode i lommen. Bygget rundt salgsarkitekturen i Nobel.pdf side 5 (hero → add-ons → ordreløftere).

---

## Prompt

```
Les PROJECT_BRIEF.md seksjon 6.1 og 7.
Les Nobel.pdf side 4-5 og 11-12 (App-opplevelsen, Salgsarkitekturen, 20 sek til låst ordre).
Les LINI/00-context.md.
Les apps/nobel-drop/app/(customer)/index.tsx, drop/[id].tsx, checkout.tsx, orders/index.tsx, orders/[id].tsx.

Bygg ut hele kunde-flyten slik at den matcher 20-sekunders løftet og pyramide-strukturen.

1. Hjem-feed (app/(customer)/index.tsx):
   - Tre seksjoner i prioritert rekkefølge:
     a. "Live nå" — alle drops med status='live', sortert etter starts_at desc
     b. "Snart" — drops med status='scheduled' og starts_at innen 7 dager
     c. "Bestill kake" — egen seksjon for premium-kaker (drop_items.role='order_lifter') som er evergreen
   - Hver kortet viser: cover_image, navn, hype_copy, ScarcityBar (live), countdown (snart)
   - Bruk Realtime for å oppdatere live-tilstand uten refresh

2. Drop-detalj (app/(customer)/drop/[id].tsx):
   - Hero-produkt øverst (drop_items.role='hero') — STORT bilde, navn, pris, ScarcityBar
   - Add-ons-seksjon (role='addon') — small grid, lett å klikke + på
   - Ordreløftere-seksjon (role='order_lifter') — premium-kaker for anledningen
   - Kurv-counter floater nederst med "Gå til kassen" når items > 0
   - Realtime-subscription per drop_items for live-counter

3. Cart-state (apps/nobel-drop/lib/cart.tsx):
   - Verifisér at cart holder { drop_id, lines: [{ drop_item_id, quantity, name, unit_price_ore, role }] }
   - Lag selector totalQty, totalOre, heroOre, addonsOre, lifterOre
   - Lag selector "kr_til_neste_tier": neste tier-grense - totalOre (eller null hvis tier 4)

4. Checkout (app/(customer)/checkout.tsx):
   - Steg 1: Vis kurv med +/- per linje (kall reserve_order på nytt hvis qty endres? — nei, kurv er kun client-side til Bestill-trykk)
   - Steg 2: Pickup-velger
     - Liste over windows for valgt drop, gruppert per node
     - Hver window viser: node-navn, adresse, tid, ledige slots
     - Klikk på et slot → låst valg
   - Steg 3: Tier-prompt
     - Hvis totalOre er innen 200 kr fra neste tier, vis "Du mangler 120 kr for å nå 15% Nobel-kreditt — legg til en porsjonskake?"
     - Med shortcut-knapp som scrollet tilbake til add-ons-seksjon
   - Steg 4: Betaling
     - Vis Vipps + Apple Pay + Klarna-knapper (les 04-payments.md for SDK-integrasjon)
     - Vis Nobel-kreditt-toggle med saldo
     - Vis sum, kreditt-trekk, å betale
     - "Bekreft og betal" → kall create-order edge function
     - 20-sekunders countdown vises som timer-bar mens reserve er aktiv

5. Ordre-detalj (app/(customer)/orders/[id].tsx):
   - Viser status (pending/reserved/paid/confirmed/picked_up/refunded)
   - Når status='paid' eller 'confirmed': vis QR-kode (react-native-qrcode-svg), pickup-tid, adresse
   - "Legg til i Apple Wallet / Google Pay"-knapp (avansert, kan komme senere)
   - "Hvis stoppet avlyses"-info-seksjon
   - Real-time subscription på orders WHERE id=$id for å fange status-endringer

6. Ordre-liste (app/(customer)/orders/index.tsx):
   - Gruppert: Aktive (paid/confirmed) → Tidligere → Refunderte
   - Per ordre: drop-navn, hentested + tid, status-badge, total

7. Account (app/(customer)/account.tsx):
   - Viser Nobel-kreditt-saldo med tier-stige
   - Push-toggle (kobler til 09-notifications.md)
   - Marketing-consent-toggle
   - Logout-knapp

Lag/oppdater filer:
- apps/nobel-drop/app/(customer)/index.tsx (utvid)
- apps/nobel-drop/app/(customer)/drop/[id].tsx (utvid)
- apps/nobel-drop/app/(customer)/checkout.tsx (utvid med tier-prompt + 20s countdown)
- apps/nobel-drop/app/(customer)/orders/[id].tsx (utvid med realtime + QR-pass design)
- apps/nobel-drop/app/(customer)/orders/index.tsx (utvid med gruppering)
- apps/nobel-drop/app/(customer)/account.tsx (utvid med tier-stige-visualisering)
- apps/nobel-drop/lib/cart.tsx (utvid med selectors)
- apps/nobel-drop/components/TierLadder.tsx (ny — viser Nivå 1-4 med markeringspunkt)
- apps/nobel-drop/components/CountdownTimer.tsx (gjenbruk eller polér)
- apps/nobel-drop/components/QRPass.tsx (ny — strukturert pickup-pass design)

Verifiser:
- Manuell e2e: logg inn → se hjem-feed → klikk drop → legg hero + 2 add-ons + 1 kake → totalt > 1500 kr → tier-prompt vises → velg slot → bekreft → reservasjon i 20s → mock-betaling → ordre med QR → ordre vises i listen
- Refresh appen midt i 20-sekunderen → reservasjon utløper, units frigjøres (verifiser i SQL)
```

---

## Acceptance criteria

- [ ] Hjem-feed viser live + snart + evergreen i tre seksjoner
- [ ] Drop-detalj følger pyramide-strukturen (hero / addons / lifters)
- [ ] Tier-prompt foreslår hva som mangler for å nå neste tier
- [ ] 20-sek countdown vises mens reservasjon er aktiv
- [ ] QR-pass vises på paid+confirmed ordre, oppdaterer status real-time
- [ ] Account viser tier-stige med tydelig "du har 250 kr i kreditt"-visning

---

## Designnotater

- Hold premium-følelsen: ingen utropstegn i copy, korte selvsikre setninger
- Animasjoner under 300ms, ikke spring-bouncy
- Bruk eksisterende theme tokens (`lib/theme.ts`)
- Når hero-produkt er sold_out: vis "Utsolgt" istedenfor knapp, men la add-ons fortsatt være tilgjengelig hvis de har units igjen (sjelden, men håndtér)
