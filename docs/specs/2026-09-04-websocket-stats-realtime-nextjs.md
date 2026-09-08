# Spec: lato Next.js per le statistiche real-time (Dashboard)

Controparte di `websocket-stats-spec.md` (quella è per l'API Go, questa è
per `emly-dashboard-react`). Presuppone che l'API esponga
`wss://<API_BASE_URL>/v2/stats/stream` con il protocollo descritto lì
(envelope `subscribe/subscribed/snapshot/update/error/ping/pong`, canali
`stats:summary`/`stats:clients`/`stats:events`).

## 0. Vincoli verificati sul deploy attuale (perché guidano le scelte sotto)

Ho controllato `emly-go-api` per allineare questa spec alla realtà, non a
ipotesi:

- **MySQL**, non Postgres (`go-sql-driver/mysql` + `sqlx`) → niente
  `LISTEN/NOTIFY`, l'API userà un event bus in-process (coerente con
  deploy a istanza singola, `docker-compose.yml` non ha repliche).
- Auth stats lato API è **solo** `X-Admin-Key` (`internal/middleware/adminKey.go`
  fa match esatto contro `ADMIN_KEY`); `X-Dashboard-Key` che la dashboard
  invia oggi non viene controllato lato Go — non c'è nulla da riprodurre per
  quello, resta un header opzionale.
- L'hook naturale per pubblicare eventi sul bus è
  `recordUpdaterEvent` in `internal/handlers/updates.route.go` (unico punto
  che fa `INSERT INTO updater_events`) — irrilevante per la dashboard, ma
  conferma che un solo evento trigger basta anche lato API.
- **Divergenza da segnalare**: l'API oggi risponde già con campi che
  `lib/api.ts` non modella — `product` (query param `?product=emly|updater|all`,
  default `emly`) su `summary`/`clients`/`events`, e
  `clients_by_config_revision` dentro `StatsSummary`. Non è in scope qui,
  ma la spec sotto include questi campi nei tipi cache del hub per non
  perderli quando arriveranno via WS — andranno comunque aggiunti anche ai
  tipi REST in `lib/api.ts` a parte.
- `next.config.ts` ha `output: "standalone"`, il container fa `CMD ["node", "server.js"]`
  generato dalla build — **niente custom server**. Questo esclude di
  agganciare un vero endpoint WebSocket lato Next.js (richiederebbe un
  server HTTP custom che intercetta l'`upgrade`, cosa che il pattern
  standalone di Next 16 non espone in modo pulito/stabile). Per il
  leg browser↔Next.js si usa quindi **Server-Sent Events (SSE)** via un
  normale Route Handler, non un secondo WS.

## 1. Architettura

```
[emly-go-api]                    [Next.js server process (server.js)]                [Browser]
 /v2/stats/stream  <--- 1 conn. WS --->  stats-hub (singleton, server-only)
                                              |  EventEmitter locale
                                              v
                                   app/api/stats/stream/route.ts (SSE, Node runtime)
                                              |  1 stream per tab connesso
                                              v
                                     EventSource nel browser  ---------------------->  useStatsStream()
                                                                                         |
                                                                     merge in stato React dei componenti
                                                                     StatsSummaryCards / StatsClientsTable
                                                                     (props iniziali da RSC + live update)
```

Due leg distinti, entrambi necessari:

1. **Next.js ↔ API** (server-to-server): un solo client WS per processo
   Next.js, gestito dal modulo `lib/realtime/stats-hub.ts` — è il consumer
   descritto nella spec API.
2. **Browser ↔ Next.js** (stesso dominio, quindi niente CORS/token nuovi):
   SSE via Route Handler, autenticato con lo stesso cookie di sessione già
   usato dal resto della dashboard (`emly_session` → `getCurrentUser()`).

## 2. `lib/realtime/stats-hub.ts` — singleton server-only

Responsabilità:

- Aprire e mantenere **una** connessione WS verso
  `wss://<API_BASE_URL>/v2/stats/stream`, con header `X-Admin-Key`
  (`env.adminKey`) + `X-Dashboard-Key` se presente (`env.dashboardKey`) —
  stessi valori già usati da `apiFetch` in `lib/api.ts`, nessun nuovo env
  var da aggiungere.
- Alla connessione, inviare **un solo** `subscribe` con parametri fissi
  lato server (v1 — vedi §5 per il perché):
  ```json
  { "type": "subscribe", "channels": ["stats:summary", "stats:clients"], "params": { "window_minutes": 15 } }
  ```
  `stats:events` **non** viene sottoscritto qui in v1 — resta sul percorso
  REST esistente, il hub lo usa solo come segnale "qualcosa è cambiato,
  ri-fetcha" (§5).
- Tenere in memoria l'ultimo `snapshot`/`update` ricevuto per
  `stats:summary` e `stats:clients` (cache in-process, niente DB/Redis: un
  solo processo, va bene una variabile di modulo).
- Riemettere ogni `update` su un `EventEmitter` locale (`hub.on("stats:summary", cb)`,
  `hub.on("stats:clients", cb)`, più un evento sintetico `hub.on("stats:events:changed", cb)`
  quando arriva un `update` che l'API manda per far sapere "c'è un nuovo
  evento", anche se in v1 quel canale specifico non è sottoscritto — vedi
  nota in §5 su come ottenere comunque questo segnale senza sottoscrivere
  l'intero canale `stats:events`).
- **Un solo listener per canale verso l'esterno**: ogni Route Handler SSE
  (una tab browser) si registra/deregistra sull'EventEmitter, non apre una
  connessione WS propria — l'hub è il collo di bottiglia unico verso l'API,
  esattamente come oggi `lib/api.ts` è l'unico punto che parla con l'API.
- **Singleton che sopravvive all'HMR di `next dev`**: modulo Node
  ri-valutato ad ogni cambio file in dev ricreerebbe la connessione ad ogni
  save. Guardia standard (stesso pattern del singleton Prisma):
  ```ts
  const globalForHub = globalThis as unknown as { statsHub?: StatsHub };
  export const statsHub = globalForHub.statsHub ?? new StatsHub();
  if (process.env.NODE_ENV !== "production") globalForHub.statsHub = statsHub;
  ```
- Riconnessione con backoff esponenziale (1s → 30s, jitter), re-invio del
  `subscribe` ad ogni riconnessione. Nessuno stato da recuperare: alla
  riconnessione arriva un nuovo `snapshot` completo.
- Ping/pong applicativo ogni 30s verso l'API (simmetrico a quanto
  specificato lato API), timeout 90s prima di considerare la connessione
  morta e forzare la riconnessione.
- Stato esposto (`hub.status(): "connecting" | "open" | "reconnecting" | "closed"`)
  — serve al Route Handler SSE per far sapere al browser se i dati live
  sono attivi o se sta servendo solo l'ultimo snapshot cache.
- **Lazy init**: il hub non si connette all'import del modulo, ma alla
  prima richiesta SSE (`hub.ensureStarted()`), per non aprire una
  connessione WS inutile durante `next build` o in ambienti dove
  `/statistics` non viene mai visitata.

## 3. `app/api/stats/stream/route.ts` — SSE Route Handler

```ts
export const runtime = "nodejs";       // niente Edge: serve accesso al singleton hub
export const dynamic = "force-dynamic"; // niente cache statica su uno stream
```

Comportamento:

1. `getCurrentUser()` (stesso helper di `lib/auth.ts` già usato dal layout)
   → se `null`, `401` e stop. Stessa identità/sessione di tutta la
   dashboard, nessun token nuovo lato browser.
2. `hub.ensureStarted()`.
3. Risposta `Content-Type: text/event-stream`, corpo un `ReadableStream`
   che:
   - scrive subito un evento `snapshot` con l'ultimo stato cache per
     `stats:summary` e `stats:clients` (anche se il hub non si è ancora
     riconnesso dopo un riavvio, si serve quanto disponibile — se non c'è
     nulla ancora, si invia solo dopo il primo snapshot dal hub, con un
     timeout ragionevole oltre il quale il browser fa comunque fallback
     alla REST già presente in pagina);
   - registra i listener su `hub` e inoltra ogni `update` come evento SSE
     tipizzato (`event: stats-summary`, `event: stats-clients`,
     `event: stats-events-changed`);
   - manda un commento di keep-alive (`: ping\n\n`) ogni ~20s, per non far
     chiudere la connessione da eventuali proxy intermedi per inattività;
   - alla disconnessione (`request.signal.addEventListener("abort", ...)`)
     rimuove i listener — fondamentale, altrimenti ogni riconnessione del
     browser (l'`EventSource` nativo riconnette da solo su errore) accumula
     listener orfani sul hub.
4. Nessun parametro di sottoscrizione accettato dal client in v1 (il hub ha
   un solo set di parametri fissi, §2) — se in futuro serve personalizzare
   `window_minutes` per utente, si passa come query string
   (`?window_minutes=30`) e si valuta se vale la pena far gestire al hub
   sottoscrizioni multiple verso l'API (complessità che oggi non serve).

## 4. Lato browser: hook + componenti

### 4.1 `hooks/use-stats-stream.ts` (nuovo, `"use client"`)

```ts
function useStatsStream<T>(channel: "stats-summary" | "stats-clients", initial: T): {
  data: T;
  live: boolean; // true finché lo stream è connesso, false se è caduto (badge "dati non aggiornati")
}
```

- Apre un `EventSource("/api/stats/stream")` **una volta per pagina**
  (idealmente un solo `EventSource` condiviso tra i due canali, non uno per
  hook-instance — usare un piccolo context/provider `StatsStreamProvider`
  che apre la connessione e la espone via React context, così
  `StatsSummaryCards` e `StatsClientsTable` non aprono ciascuno la propria).
- `initial` è il valore renderizzato server-side (quello che oggi arriva
  già come prop da `getStatsSummary()`/`getAllStatsClients()` in
  `page.tsx`) — lo stato parte da lì, l'update lo sostituisce quando
  arriva. Nessun flash/loading state al mount, nessuna richiesta REST
  duplicata.
- `EventSource` gestisce da solo il riconnect (nativo, con backoff
  controllato dal server via `retry:`); l'hook espone solo `live` per
  mostrare un badge discreto se lo stream è giù (fallback: i dati restano
  quelli dell'ultimo update valido, la pagina resta funzionante).

### 4.2 Modifiche ai componenti esistenti

Tutti e tre (`components/stats-summary-cards.tsx`, `stats-clients-table.tsx`,
`stats-events-chart.tsx`) sono **già** Client Component che ricevono i dati
come prop da `app/(dashboard)/statistics/page.tsx` (Server Component) — il
diff resta minimo:

- `page.tsx` **non cambia il suo fetch iniziale** (resta `getStatsSummary`/
  `getAllStatsClients`/`getStatsEvents`, invariati — è il bootstrap SSR e il
  fallback no-JS).
- Si avvolge la sezione statistiche in un nuovo `<StatsStreamProvider initialSummary={...} initialClients={...}>`
  (client component) che tiene lo stato live e lo passa giù a
  `StatsSummaryCards`/`StatsClientsTable` al posto delle prop dirette da
  `page.tsx`.
- `StatsEventsChart` **non** viene toccato per ricevere dati live diretti
  (v1, vedi §5): riceve `data` come oggi da `page.tsx`. L'unica aggiunta è
  che il provider, quando riceve l'evento sintetico `stats-events-changed`
  dal hub (debounced, es. 2s), chiama `router.refresh()` — questo ri-esegue
  il Server Component `page.tsx` con gli stessi `searchParams` (bucket/
  event_type) già in URL, quindi il grafico si aggiorna **senza duplicare**
  la logica di filtro/query che oggi vive solo lato server.

## 5. Perché `stats:events` non è push diretto in v1 (scelta deliberata)

`stats:events` ha parametri variabili per utente (`bucket`, `event_type`, e
in futuro `product`/`from`/`to`), mentre `stats:summary`/`stats:clients`
hanno essenzialmente un solo `window_minutes` condiviso da tutta la
dashboard. Sottoscrivere `stats:events` con parametri per-tab richiederebbe
che il hub gestisca N sottoscrizioni diverse verso l'API (una per
combinazione bucket/event_type effettivamente in uso), il che è la
complessità che la spec API prova a evitare per un servizio a singola
istanza con poche connessioni dashboard.

Soluzione più semplice e sufficiente: il hub sottoscrive solo
`stats:summary`/`stats:clients` (parametri fissi, un solo set), e usa gli
`update` su `stats:events` che l'API manda comunque (o, se preferite non
sottoscrivere nemmeno quel canale, un canale leggero dedicato tipo
`stats:events:ping` — **da concordare con la spec API**, è l'unica modifica
che questa parte richiede a quella spec) solo come **trigger**: "è successo
qualcosa, ri-chiedi pure la REST che già usi". Il grafico resta quindi
sempre coerente con i filtri scelti dall'utente senza duplicare query logic
client-side, al costo di un piccolo delay (debounce) invece di un push
istantaneo — accettabile per un grafico aggregato per giorno/ora.

Se in futuro servisse push istantaneo anche sul grafico, si estende
`useStatsStream` con un terzo canale e si sposta il filtro bucket/event_type
lato client (props URL → hub subscribe dinamico) — rimandato a quando
sarà un requisito reale.

## 6. Comportamento in assenza di stream (degradazione)

- Se `/api/stats/stream` non è raggiungibile (hub mai connesso all'API,
  o SSE bloccato da un proxy aziendale che buffera `text/event-stream`):
  la pagina resta **identica a oggi** — dati SSR al caricamento, nessun
  aggiornamento live, nessun errore visibile all'utente a parte
  l'eventuale badge "live" spento.
- Nessuna dipendenza nuova obbligatoria: se il hub non implementato/non
  raggiungibile, `StatsStreamProvider` può semplicemente non montare
  l'`EventSource` (feature flag via env, es. `STATS_REALTIME_ENABLED`) e i
  componenti si comportano esattamente come prima di questa modifica.

## 7. Checklist implementativa (lato dashboard)

- [ ] `lib/realtime/stats-hub.ts`: client WS singleton (§2), reconnect,
      cache in-memory, `EventEmitter`.
- [ ] `app/api/stats/stream/route.ts`: SSE Route Handler, auth via
      `getCurrentUser()`, keep-alive, cleanup su abort (§3).
- [ ] `hooks/use-stats-stream.ts` + `components/stats-stream-provider.tsx`
      (context che apre un solo `EventSource` per pagina) (§4.1).
- [ ] Adattare `app/(dashboard)/statistics/page.tsx` per avvolgere
      `StatsSummaryCards`/`StatsClientsTable` nel provider, passando i dati
      SSR come `initial*` (§4.2).
- [ ] `router.refresh()` debounced su `stats-events-changed` per il grafico
      (§4.2/§5).
- [ ] Env var opzionale `STATS_REALTIME_ENABLED` (default `true`) per
      spegnere il tutto senza redeploy del codice (§6).
- [ ] Allineare separatamente `lib/api.ts`/tipi REST ai campi già presenti
      nell'API (`product`, `clients_by_config_revision`) — non
      strettamente parte del realtime, ma va fatto perché il hub li dovrà
      comunque portare nei payload live (§0).

## 8. Cosa NON è in scope qui

- Nessun WebSocket server dentro Next.js (esclude per il deploy standalone,
  §0).
- Nessuna sottoscrizione per-utente a `stats:events` con filtri custom
  (rimandato, §5).
- Nessun cambiamento all'auth: stessa sessione cookie-based già esistente,
  nessun token nuovo esposto al browser.
