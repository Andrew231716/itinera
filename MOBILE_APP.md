# Itinera — app mobile (Capacitor)

La PWA tiene lo schermo acceso in navigazione (Screen Wake Lock + keepalive audio), ma **non** può garantire GPS continuo a schermo spento (limite browser iOS/Android).

Questo scaffold wrappa l’app Next.js hostata (Vercel) in un WebView nativo e usa `@capacitor/geolocation` quando `window.Capacitor.isNativePlatform()` è true.

## Prerequisiti

- Node 20+
- Xcode (iOS) e/o Android Studio
- URL pubblico HTTPS dell’app (es. `https://itinera.vercel.app`)

## Setup una tantum

```bash
export CAPACITOR_SERVER_URL="https://TUO-DOMINIO.vercel.app"
npm install
npx cap add android   # oppure ios
npx cap sync
npx cap open android  # oppure ios
```

`webDir` punta a `public/` solo perché Capacitor richiede una cartella locale: il runtime carica `server.url` (l’app Next.js remota con le API route).

## Permessi GPS / background

### Android (`android/app/src/main/AndroidManifest.xml`)

Aggiungi (se non già presenti dopo `cap add`):

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

Per tracking affidabile a schermo spento valuta un plugin di **background geolocation** / foreground service (es. community `@capacitor-community/background-geolocation`) e una notifica persistente “Navigazione in corso”. Il bridge JS in `src/lib/navigation/platform.ts` è già pronto a usare il Geolocation nativo Capacitor in foreground; il plugin background si innesta nello stesso watcher.

### iOS (`ios/App/App/Info.plist`)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Itinera usa la posizione per la navigazione guidata sul percorso calcolato.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Itinera può continuare a aggiornare la posizione durante la navigazione anche in background.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>audio</string>
</array>
```

Su iOS, “Always” richiede review Apple; senza Always il GPS si sospende in background.

## Script utili

| Comando | Uso |
|--------|-----|
| `npm run cap:sync` | Sincronizza config + plugin verso `android/` / `ios/` |
| `npm run cap:open:android` | Apre Android Studio |
| `npm run cap:open:ios` | Apre Xcode |

## Cosa resta PWA vs nativo

| Funzione | PWA | Capacitor |
|----------|-----|-----------|
| Percorso Itinera + esclusioni | sì | sì (stesso backend) |
| Schermo acceso (Wake Lock) | sì (Chrome/Android; supporto variabile iOS) | sì + audio background mode |
| GPS schermo spento | no | sì con permessi + (consigliato) plugin background |
| Store listing | — | App Store / Play |

## Comando vocale in-app (web / PWA / Capacitor)

Il pulsante microfono flottante usa il riconoscimento vocale del browser (Chrome / Safari):

1. Tocca il microfono  
2. Di’ ad esempio: **«Portami in Via Gardenie a Rozzano»**  
3. Itinera prende il GPS come partenza, risolve la destinazione, calcola i percorsi  
4. Apri **Riepilogo**, scegli il percorso migliore e avvia la navigazione  

Deep link (utile anche da Scorciatoie / Siri):

```
https://itinera-psi.vercel.app/?go=Via+Gardenie+Rozzano
https://itinera-psi.vercel.app/?voice=portami+in+via+gardenie+a+rozzano
https://itinera-psi.vercel.app/go?q=Via+Gardenie+Rozzano
```

## «Hey Siri … con Itinera»

Una PWA **non** può registrare frasi Siri di sistema da sola (limite Apple).  
Puoi comunque collegare Siri in due modi:

### A) App Scorciatoie (consigliato, subito)

1. Apri **Scorciatoie** su iPhone  
2. Nuova scorciatoia → azione **Apri URL**  
3. URL: `https://itinera-psi.vercel.app/?go=` + destinazione  
   - Oppure chiedi testo: «Dove vuoi andare?» → passa la risposta nell’URL  
4. **Aggiungi a Siri** → frase: *«Portami … con Itinera»* oppure *«Naviga con Itinera»*  
5. Prova: *«Hey Siri, naviga con Itinera»* → inserisci Via Gardenie → si apre Itinera e calcola  

Esempio URL fisso:

`https://itinera-psi.vercel.app/?go=Via%20Gardenie%20Rozzano`

### B) App nativa Capacitor (dopo build iOS)

Dopo `npx cap add ios`, in Xcode puoi aggiungere:

- URL scheme `itinera://go?q=…` in **Info → URL Types**  
- (Opzionale) **App Intents / App Shortcuts** per una frase Siri dedicata che apre lo stesso deep link  

Finché non pubblichi su App Store, il percorso A (Scorciatoie) è quello pratico e equivalente all’uso quotidiano.

## Note

- Non committare segreti nelle native projects; le API key restano solo server-side su Vercel.
- Dopo un cambio di `CAPACITOR_SERVER_URL`, rilancia `npm run cap:sync`.
- Cartelle `android/` e `ios/` sono generate localmente (gitignored finché non le versioni deliberatamente).

