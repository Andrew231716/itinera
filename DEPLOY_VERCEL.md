# Deploy Itinera — Supabase + Vercel

Guida operativa in italiano. Piano gratuito Supabase e Hobby Vercel sono sufficienti.
**Non** attivare piani a pagamento se non li vuoi. Non inventare URL/chiavi: copiale dai dashboard.

OpenAI con credito esaurito (`credit_balance_exhausted`) **non blocca** il deploy: l’assistente resta off finché non ricarichi; Maps/Places/Routes e il resto dell’app funzionano lo stesso.

---

## Checklist rapida

1. [ ] Progetto Supabase creato (Free)
2. [ ] SQL `supabase/migrations/001_itinera_trips.sql` eseguito in SQL Editor
3. [ ] Copiati Project URL + anon public key
4. [ ] Repo su GitHub (o CLI Vercel)
5. [ ] Progetto Vercel creato e collegato al repo
6. [ ] Tutte le env vars impostate su Vercel (Production + Preview consigliato)
7. [ ] Deploy riuscito → copia dominio `*.vercel.app`
8. [ ] Aggiornate le HTTP referrer restrictions della **browser key** Google con quel dominio
9. [ ] Verifica: apri il sito → tab Live → «Verifica connettività» oppure `GET /api/health?probe=1`

---

## Parte A — Supabase (click per click)

### A1. Crea il progetto

1. Vai su [https://supabase.com/dashboard](https://supabase.com/dashboard) e accedi.
2. **New project**.
3. Scegli organizzazione (o creane una).
4. **Name**: es. `itinera`.
5. **Database password**: generane una forte e **salvala** (serve solo per DB diretto; Itinera usa URL + anon key).
6. **Region**: la più vicina (es. `eu-central-1` / Frankfurt).
7. Piano **Free** → **Create new project**.
8. Attendi che lo stato passi a **Healthy** / Ready.

### A2. Esegui la migration SQL

1. Nel progetto: menu sinistro → **SQL Editor**.
2. **New query**.
3. Apri nel repo il file `supabase/migrations/001_itinera_trips.sql` e **incolla tutto** il contenuto.
4. **Run** (o Ctrl/Cmd+Enter).
5. Controlla che non ci siano errori rossi.
6. Opzionale: **Table Editor** → dovresti vedere le tabelle `trips` e `shared_trips`.

Cosa fa lo script: tabelle viaggi + share, RLS per utenti autenticati, RPC `get_shared_trip` per link pubblici in sola lettura.

### A3. Copia URL e anon key

1. Menu sinistro → **Project Settings** (ingranaggio) → **API**.
2. Copia:
   - **Project URL** → andrà in `NEXT_PUBLIC_SUPABASE_URL`
   - **anon** / **public** key → andrà in `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Non** usare la `service_role` nel frontend né in variabili `NEXT_PUBLIC_*`.
   La `service_role` è opzionale e solo server-side per operazioni avanzate; Itinera di default usa solo anon + RLS/RPC.

### A4. Nota comportamentale

- Senza Supabase l’app funziona con **localStorage**.
- Con URL + anon key: Hybrid repository prova il sync cloud; la condivisione pubblica usa l’RPC `get_shared_trip`.
- Le policy RLS nello SQL coprono i viaggi di utenti **autenticati** (`owner_id`). Il salvataggio locale resta sempre la fonte offline.

---

## Parte B — Vercel (click per click)

### B1. Prerequisito codice

- Script di produzione: `npm run build` → `next build` (**senza** Turbopack). Turbopack resta solo su `npm run dev`.
- `next.config.ts` è minimale (default Vercel OK). **Nessun** `vercel.json` obbligatorio.
- Push del branch su GitHub (o usa Vercel CLI).

### B2. Import da GitHub (consigliato)

1. Vai su [https://vercel.com/new](https://vercel.com/new) e accedi (GitHub OAuth).
2. **Import** del repository Itinera.
3. Framework Preset: **Next.js** (auto-detect).
4. Root Directory: `.` (default).
5. Build Command: `next build` / `npm run build` (default).
6. Output: default Next.js (non cambiare in static export).
7. **Non** fare Deploy ancora se puoi: prima imposta le Environment Variables (altrimenti fai Deploy e poi **Redeploy** dopo averle salvate).

### B2bis. Alternativa CLI

```bash
npm i -g vercel
vercel login
cd /path/to/itinera
vercel          # preview
vercel --prod   # production
```

Durante il wizard puoi collegare il progetto; le env si possono aggiungere anche da dashboard.

### B3. Environment Variables su Vercel

Dashboard progetto → **Settings** → **Environment Variables**.

Imposta almeno per **Production** (consigliato anche **Preview**):

| Nome | Obbligatoria per live Maps? | Note |
|------|----------------------------|------|
| `GOOGLE_MAPS_API_KEY` | Sì (server Places/Routes) | **Non** `NEXT_PUBLIC_*`. Segreta. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Sì (mappa JS) | Esposta al browser. Restringi per referrer (vedi B5). |
| `NEXT_PUBLIC_SUPABASE_URL` | Per cloud save/share | Da Supabase Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Per cloud save/share | Solo chiave **anon** |
| `OPENAI_API_KEY` | No (opzionale) | Assistente NL. Se credito esaurito, deploy ok ma assistente fallisce. |
| `OPENAI_MODEL` | No | Default codice: `gpt-4o-mini` |

Opzionali (di solito non servono al go-live):

| Nome | Note |
|------|------|
| `GOOGLE_ROUTES_API_KEY` | Alias opzionale della key Routes |
| `ROUTING_ENGINE` | Default `google_routes` |
| `OPENROUTESERVICE_API_KEY` | Adapter non completo end-to-end |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server, mai `NEXT_PUBLIC_*`; non richiesta dal flusso standard |

**Importante su `NEXT_PUBLIC_*`:**

- Vengono **inline** nel bundle client al momento del **build**.
- Dopo aver aggiunto/modificato una `NEXT_PUBLIC_*`, serve un **nuovo Deploy** (Redeploy), non basta salvarle.
- Non mettere mai secret server in `NEXT_PUBLIC_*`.

### B4. Deploy

1. **Deploy** (o **Redeploy** se le env erano assenti al primo build).
2. Attendi build verde.
3. Apri l’URL `https://<progetto>.vercel.app`.
4. Copia il dominio esatto (e eventuali custom domain).

### B5. Google Maps — aggiorna i referrer della browser key (obbligatorio)

Senza questo passo la mappa JS su Vercel resta bloccata (referrer non autorizzato).

1. [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) → progetto `itinera-509522` (o il tuo).
2. Apri la API key **Itinera browser** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`).
3. **Application restrictions** → **HTTP referrers**.
4. Aggiungi (adatta al tuo dominio):

   ```
   http://localhost:3000/*
   https://localhost:3000/*
   https://<tuo-progetto>.vercel.app/*
   https://*.vercel.app/*
   ```

   Se usi un dominio custom:

   ```
   https://tuodominio.it/*
   https://www.tuodominio.it/*
   ```

5. **API restrictions**: solo **Maps JavaScript API** → **Save**.
6. La key **server** (`GOOGLE_MAPS_API_KEY`) resta senza restrizione HTTP referrer (None o IP); API: Places API (New) + Routes API.

Propagazione restrizioni: a volte 1–5 minuti.

### B6. Verifica post-deploy

1. Homepage carica senza errori console gravi.
2. Tab **Live** → **Verifica connettività**, oppure:
   - `https://<tuo-dominio>/api/health`
   - `https://<tuo-dominio>/api/health?probe=1`
3. Test rapido: partenza/arrivo (es. Milano → Roma) con route reale.
4. Se OpenAI è senza credito: l’assistente segnala errore; il resto resta usable.

---

## Troubleshooting breve

| Sintomo | Causa tipica | Cosa fare |
|---------|--------------|-----------|
| Build Vercel fallisce su turbopack | `next build --turbopack` | Usa `next build` (già corretto in `package.json`) |
| Mappa grigia / `RefererNotAllowedMapError` | Referrer browser key | Aggiungi dominio Vercel (B5) |
| Places/Routes in demo | Manca `GOOGLE_MAPS_API_KEY` su Vercel | Aggiungi env + Redeploy |
| Supabase «non configurato» | Mancano URL/anon o no Redeploy dopo `NEXT_PUBLIC_*` | Imposta env e Redeploy |
| Assistente KO | Credito OpenAI esaurito o key assente | Opzionale: ricarica billing OpenAI |
| Share 404 / vuoto | SQL non eseguito o token revocato | Riesegui migration; controlla `shared_trips` |

---

## Riferimenti locali

- Variabili template: `.env.example`
- Go-live Google keys (locale): `GO_LIVE.txt`
- Migration: `supabase/migrations/001_itinera_trips.sql`
- Health: `GET /api/health` e `GET /api/health?probe=1`
