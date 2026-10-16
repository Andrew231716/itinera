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

## Note

- Non committare segreti nelle native projects; le API key restano solo server-side su Vercel.
- Dopo un cambio di `CAPACITOR_SERVER_URL`, rilancia `npm run cap:sync`.
- Cartelle `android/` e `ios/` sono generate localmente (gitignored finché non le versioni deliberatamente).
