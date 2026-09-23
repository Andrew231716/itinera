# Itinera — Intelligent Route Planner

Applicazione web per creare, personalizzare, visualizzare e condividere itinerari di viaggio con tappe multiple, preferenze stradali ed esclusioni geografiche.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Google Maps JavaScript API (mappa)
- Google Places API (ricerca località, via API Routes)
- Google Routes API (calcolo percorsi, via API Routes)
- Zustand (stato viaggio)
- @dnd-kit (riordino tappe)
- Supabase / OpenAI predisposti per fasi successive

## Avvio

```bash
npm install
cp .env.example .env.local
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Variabili d'ambiente

| Variabile | Dove | Scopo |
|-----------|------|--------|
| `GOOGLE_MAPS_API_KEY` | server | Places + Routes (segreta) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | browser | Maps JS (restringi per referrer) |
| `OPENAI_API_KEY` | server | Assistente NL (Fase 6) |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | client | Persistenza (Fase 5) |

Senza chiavi Google l'app avvia in **modalità demo** chiaramente segnalata: suggerimenti località curati, mappa illustrativa, nessun percorso inventato.

## Architettura

```
src/
  app/api/          # Places, Routes, Maps config, Assistant
  components/       # UI, mappa, pannelli viaggio
  lib/
    types/          # Trip, Route, Exclusion
    store/          # Zustand trip store
    google/         # Places, Routes, Maps links
    routing/        # Preferenze, vincoli, engine abstraction
    storage/        # Local repo + scaffold Supabase
    ai/             # Scaffold OpenAI
```

## Fasi

1. **Operativa** — UI, mappa, Places (live/demo), tappe CRUD + drag&drop, pick from map
2. **Operativa** — Routes API + demo mode onesto
3. **Operativa** — Preferenze, esclusioni, verifica vincoli sul path
4. **Operativa** — Link Google Maps, export, share URL, segmenti
5. **Predisposta** — repository pattern; oggi localStorage
6. **Predisposta** — endpoint assistant; richiede OpenAI

## Sicurezza

- Chiavi segrete solo nel backend
- Validazione input sulle API Routes
- Nessun log di segreti
- Preferenze Google presentate come indicazioni, non garanzie
