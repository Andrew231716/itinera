# Itinera — Intelligent Route Planner

Pianificatore di viaggi con tappe multiple, preferenze stradali, esclusioni geografiche,
condivisione Google Maps, persistenza locale/Supabase e assistente in linguaggio naturale.

## Installazione e avvio

```bash
npm install
cp .env.example .env.local
# Compila le variabili necessarie
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm run lint
npm test
```

`npm run build` esegue `next build` (Webpack/production default). Turbopack è solo su `npm run dev`.

## Deploy (Supabase + Vercel)

Guida passo-passo in italiano: **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**  
Checklist breve: `GO_LIVE.txt` · template env: `.env.example`

## Variabili d'ambiente

| Variabile | Ambito | Scopo |
|-----------|--------|--------|
| `GOOGLE_MAPS_API_KEY` | server | Places + Routes (segreta) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | browser | Maps JavaScript API (restringi per HTTP referrer) |
| `OPENAI_API_KEY` | server | Assistente NL |
| `OPENAI_MODEL` | server | Default `gpt-4o-mini` |
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | Persistenza cloud |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client/server | Chiave anon (con RLS) |
| `ROUTING_ENGINE` | server | `google_routes` (default) |
| `OPENROUTESERVICE_API_KEY` | server | Adapter predisposto, non completo |

**Mai** esporre service role o chiavi server nel frontend.

## Configurazione Google Maps

1. Crea un progetto Google Cloud con billing.
2. Abilita Maps JavaScript API, Places API (New), Routes API.
3. Crea una chiave **server** (IP / nessuna restrizione browser) → `GOOGLE_MAPS_API_KEY`.
4. Crea una chiave **browser** con restrizione referrer → `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
5. Senza chiavi l’app resta in **modalità demo** e non inventa percorsi.

## Configurazione Supabase

1. Crea un progetto Supabase.
2. Esegui lo SQL in `supabase/migrations/001_itinera_trips.sql`.
3. Imposta URL e anon key in `.env.local`.
4. Per utenti autenticati: le policy RLS proteggono i viaggi per `owner_id`.
5. Condivisione pubblica: RPC `get_shared_trip(token)` (sola lettura, revocabile, scadenza opzionale).
6. Senza Supabase: funziona comunque il repository **locale** (`localStorage`).

## Configurazione OpenAI

1. Imposta `OPENAI_API_KEY`.
2. L’endpoint `/api/assistant/parse` usa Structured Outputs.
3. Le località sono risolte solo via Places API.
4. L’UI mostra un’**anteprima**; il trip store si aggiorna solo dopo conferma.

## Modalità demo

Attiva quando mancano le chiavi Google. Mostra:

- Badge “Modalità demo”
- Suggerimenti località curati (IT)
- Mappa illustrativa
- `routes: []` con limitations esplicite (nessun path inventato)

## Architettura

```
src/app/api/          Places, Routes, Maps config, Assistant, Share
src/components/       UI mappa, pannelli, stati
src/lib/google/       Clients + Maps links
src/lib/routing/      Preferenze, vincoli, engines (Google + ORS adapter)
src/lib/storage/      Local + Supabase + Hybrid
src/lib/ai/           Parser OpenAI strutturato
supabase/migrations/  Schema SQL + RLS
tests/unit/           Vitest + mock (nessun servizio a pagamento)
```

## Preferenze ed esclusioni

- **Soft / preferenziali:** tolls, highways, ferries (flag Google non garantiti), scenic/tunnel non supportati, maxExtraMinutes in post-filtro.
- **Hard:** esclusioni custom verificate sul polyline densificato. Un percorso è “conforme” solo se non ci sono violazioni hard e non restano vincoli hard non verificabili.
- Ogni preferenza espone uno stato: motore / preferenziale / post-verifica / non supportata / non verificabile.

## Motori di routing

| Motore | Stato | Avoid areas native |
|--------|-------|--------------------|
| Google Routes | Operativo con chiave | No (post-check) |
| OpenRouteService | Adapter predisposto | Sì (non attivo end-to-end) |

Valutazione sintetica: ORS adatto a `avoid_polygons`; GraphHopper forte su custom model (licenza commerciale); OSRM ottimo self-host ma avoid-area limitato senza profili custom.

## Tabella funzionalità

| Funzionalità | Stato |
|--------------|--------|
| UI + tappe + DnD + mappa | Operativa |
| Places / Routes live | Richiede config Google |
| Places / Routes demo | Operativa senza chiavi |
| Preferenze + stati | Operativa |
| Esclusioni + verifica geometrica | Operativa |
| Condivisione Google Maps + segmenti | Operativa |
| Share nativo / link pubblico locale | Operativa |
| Share cloud Supabase | Richiede config + migration |
| Persistenza locale | Operativa |
| Persistenza Supabase hybrid | Richiede config |
| Assistente OpenAI + conferma | Richiede `OPENAI_API_KEY` |
| Motore ORS completo | Non implementato (solo adapter) |
| Auth completa multi-utente UI | Non implementata (RLS predisposta) |

## Limiti API noti

- Max ~25 intermediate waypoints per richiesta Google Routes.
- Link Maps: max pratico 8 waypoint; oltre → segmentazione esplicita (nessuna tappa eliminata in silenzio).
- Esclusioni custom non trasferibili a Google Maps URL.
- Preferenze Google non sono garanzie assolute.

## Test

```bash
npm test
```

I test usano solo mock/locali: geometria, vincoli, maps links, schema assistant, repository locale. Non chiamano API a pagamento.

## Deployment

Build: `npm run build` poi `npm start`.  
Configura le env sul host. Non committare `.env.local`.

## Brand

Itinera · teal `#2C5F7C` · accent `#D4A017` · mist · Fraunces + Manrope.
