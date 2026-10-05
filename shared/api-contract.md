# Zambia LuSE Market Terminal — API CONTRACT (v1, binding for all agents)

Project: real-time Zambia stock market analysis app (Lusaka Securities Exchange, LuSE).
Canonical stock universe: `/home/z/my-project/shared/luse-stocks.json` (17 stocks, meta.index has LASI base value & USD/ZMW rate).

Architecture:
- Next.js app (port 3000) — UI + REST API routes under `src/app/api/**` (Prisma/SQLite).
- Market engine mini-service (port 3003, bun + socket.io, folder `mini-services/market-engine/`) — in-memory live simulation, socket.io + HTTP.
- Browser connects: REST to same-origin `/api/...` ; WebSocket via `io('/?XTransformPort=3003', { path: '/' })` (DO NOT put the port anywhere else in the URL; DO NOT change socket path).

---

## 1) ENGINE HTTP API (port 3003)

All responses JSON. CORS allow all.

### GET /health
`{ "ok": true, "serverTime": "<ISO>", "uptimeSec": 123 }`

### GET /api/stocks
Full market snapshot:
```json
{
  "serverTime": "ISO",
  "session": { "status": "OPEN" | "CLOSED", "label": "LuSE Live Session (SIM)" , "lusakaTime": "HH:mm:ss" },
  "usdRate": 23.50,
  "index": {
    "code": "LASI",
    "value": 25734.78,
    "prevClose": 25691.20,
    "change": 43.58,
    "changePct": 0.17,
    "history": [{ "t": 1730000000000, "v": 25731.2 }]
  },
  "stocks": [
    {
      "symbol": "ZANACO", "name": "Zambia National Commercial Bank Plc", "sector": "Banking",
      "price": 9.43, "prevClose": 9.40, "dayOpen": 9.41, "dayHigh": 9.55, "dayLow": 9.35,
      "change": 0.03, "changePct": 0.32,
      "volume": 125000, "valueTraded": 1178000,
      "bid": 9.42, "ask": 9.44,
      "marketCap": 4976211000,
      "lastUpdate": "ISO"
    }
  ]
}
```
Notes: `marketCap = price * sharesOutstanding`. `change` vs `prevClose`. `index.history` holds intraday index points (append one point per tick, cap 2000).

### GET /api/stocks/:symbol/candles?interval=1m
Intraday candles for the current session (minute buckets; seeded at boot back to session open, then live):
`{ "symbol": "ZANACO", "interval": "1m", "candles": [{ "t": 1730000000000, "o": 9.40, "h": 9.46, "l": 9.39, "c": 9.43, "v": 4200 }] }`
Ascending by time. Support `interval=1m` only (client aggregates 5m/1h).

### GET /api/stocks/:symbol/orderbook
`{ "symbol": "ZANACO", "bids": [{ "price": 9.42, "size": 1200 }], "asks": [{ "price": 9.44, "size": 800 }] }`
5 levels each side, descending bids / ascending asks, sizes random-ish but stable per few seconds.

### GET /api/news?limit=40
`{ "news": [{ "id": "n-172...", "headline": "CEC confirms load-shedding schedule talks with ZESCO", "body": "1-3 sentences.", "source": "LuSE Wire", "symbols": ["CEC"], "sentiment": "POSITIVE"|"NEGATIVE"|"NEUTRAL", "impact": "HIGH"|"MEDIUM"|"LOW", "publishedAt": "ISO" }] }`
Descending by publishedAt. Engine generates a headline every 45–120s (template-based, Zambia-themed: mining output, kwacha, ZESCO/load-shedding, BoZ rates, dividends, results, rains for agro, copper price on LME...). News about symbol X applies an immediate price impact of ±0.2%–1.5% to X in the next tick.

## 2) ENGINE SOCKET.IO EVENTS (port 3003, path "/", namespace default)

- On connect → emit `snapshot` with EXACTLY the same JSON shape as GET /api/stocks.
- Every ~1.5s → emit `tick`:
```json
{
  "serverTime": "ISO",
  "usdRate": 23.51,
  "index": { "code":"LASI", "value": 25734.78, "prevClose": 25691.20, "change": 43.58, "changePct": 0.17 },
  "stocks": [{ "symbol": "ZANACO", "price": 9.43, "change": 0.03, "changePct": 0.32, "dayHigh": 9.55, "dayLow": 9.35, "volume": 125000, "valueTraded": 1178000, "bid": 9.42, "ask": 9.44, "dir": 1 }]
}
```
`dir`: 1 = uptick, -1 = downtick, 0 = flat (for price flash animation).
- Occasionally (on generated news) → emit `news` with the single news item object (same shape as in GET /api/news).

## 3) NEXT.JS REST API (port 3000, all under src/app/api, all `export const dynamic = 'force-dynamic'`)

Server-side fetch helper: `src/lib/market-engine.ts` exports `ENGINE_URL = 'http://localhost:3003'` and `getEngine<T>(path): Promise<T>` with 3s timeout, throwing on failure. NEVER fetch absolute URLs from client code.

### GET /api/stocks → 200 engine snapshot passthrough (GET /api/stocks of engine). On engine failure: 503 `{ "error": "engine-unavailable" }`.

### GET /api/stocks/[symbol] → 200
```json
{
  "quote": { ...same stock object as engine... },
  "profile": { "symbol","name","sector","description","sharesOutstanding","peRatio","dividendYield","eps","beta","website","fiftyTwoWeekHigh","fiftyTwoWeekLow" }
}
```
Profile from Prisma `Stock` + 52w high/low computed from Prisma `DailyPrice`. 404 if unknown symbol. 503 if engine down (client keeps last tick).

### GET /api/stocks/[symbol]/candles?interval=1m|5m|1h|1d&limit=300 → 200
- `1m` → engine passthrough.
- `5m`,`1h` → fetch engine 1m candles, aggregate into 5m/1h buckets server-side.
- `1d` → Prisma DailyPrice ascending, default last 252 (limit max 500).
Response: `{ "symbol": "...", "interval": "...", "candles": [{ "t", "o", "h", "l", "c", "v" }] }`
For `1d`, `t` = date ms (UTC midnight of trading day).

### GET /api/news?limit=30 → 200
Merge Prisma NewsItem (oldest/seeded, take latest 15) + engine GET /api/news (latest 25), sort desc by publishedAt, dedupe by headline, cap at limit. `{ "news": [...] }`.

### Watchlist
- GET /api/watchlist → `{ "items": [{ "id": "...", "symbol": "ZANACO", "createdAt": "ISO" }] }`
- POST /api/watchlist `{ "symbol": "ZANACO" }` → 201 `{ "item": {...} }`; 404 unknown symbol; 409 duplicate.
- DELETE /api/watchlist/[id] → `{ "ok": true }` (404 if missing).

### Alerts
- GET /api/alerts → `{ "alerts": [{ "id","symbol","condition":"ABOVE"|"BELOW","targetPrice","active","triggeredAt","createdAt" }] }`
- POST /api/alerts `{ "symbol","condition","targetPrice" }` → 201 `{ "alert": {...} }` (validate symbol, condition, price>0).
- DELETE /api/alerts/[id] → `{ "ok": true }`
- PATCH /api/alerts/[id] body `{ "trigger": true }` → sets `triggeredAt=now`, `active=false` → `{ "alert": {...} }`; body `{ "active": false }` also allowed.

### Portfolio (paper trading, single account)
- GET /api/portfolio →
```json
{
  "cash": 100000.0,
  "initialCash": 100000.0,
  "positions": [{ "id","symbol","quantity","avgCost","realizedPnl","updatedAt" }],
  "trades": [{ "id","symbol","side":"BUY"|"SELL","quantity","price","grossValue","fees","netValue","createdAt" }]
}
```
trades desc by createdAt, max 50. GET may be slow if engine down — never block on engine (do NOT include live prices here).
- POST /api/portfolio/trade `{ "symbol","side":"BUY"|"SELL","quantity":>0 }` → executes at engine live price:
  - fees = max(commission 0.15% of gross, K5) + levy 0.05% of gross (constants in shared/luse-stocks.json meta.fees).
  - BUY: require cash >= gross + fees else 400 `{ "error": "insufficient-cash" }`. Cash -= net; position upsert (new avgCost = weighted avg).
  - SELL: require position with quantity >= qty else 400 `{ "error": "insufficient-shares" }`. Cash += gross - fees; realizedPnl += (price - avgCost)*qty - fees; quantity reduced (delete position at 0).
  - 200 → `{ "trade": {...}, "cash": ..., "position": {...}|null }`; record Trade row. 503 if engine down.
- POST /api/portfolio/reset → reset cash to initial 100000, delete positions & trades → `{ "ok": true }`.

## 4) PRISMA MODELS (authoritative: prisma/schema.prisma)
Stock, DailyPrice, NewsItem, WatchlistItem, Alert, Position, CashAccount, Trade — as defined in schema (see schema.prisma). Import db via `import { db } from '@/lib/db'`.

## 5) ERROR/EDGE RULES
- All Next routes: `try/catch` → JSON errors with proper status; never throw HTML error pages.
- Engine down → Next routes that need engine return 503 JSON; watchlist/alerts/portfolio GET keep working (Prisma only).
- All prices rounded to 2dp; volumes integers.
