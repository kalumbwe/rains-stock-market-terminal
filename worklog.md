# Worklog — Zambia LuSE Real-Time Market Terminal

---
Task ID: 1
Agent: main coordinator (Z.ai Code)
Task: Project setup — deps, shared market config, Prisma schema, seed data, API contract.

Work Log:
- Installed socket.io + socket.io-client (recharts, next-themes, zustand, TanStack Query already present).
- Researched real LuSE listed companies & recent price levels via web search (ZCCM-IH ~K149, ZANACO ~K9.43, CEC ~K15.34, ATEL ~K140, ZSUG ~K69.5, CHIL ~K63.8, ZMBF ~K1.90, PUMA ~K2.92, ZFCO ~K7.89, BATA ~K9.56, REIZ ~K1.95, SCBL ~K1.23, LASI ~25,734 pts, USD/ZMW ~23.5).
- Created `shared/luse-stocks.json` — canonical universe: 17 real LuSE companies with sector, price, prevClose, shares outstanding, fundamentals (P/E, div yield, EPS, beta) + meta (LASI base, fees, session hours Africa/Lusaka, USD/ZMW).
- Created `shared/api-contract.md` — binding contract for engine HTTP API (port 3003), socket.io events (`snapshot`, `tick`, `news`), Next.js REST API (`/api/stocks`, `/api/stocks/[symbol]/candles`, `/api/news`, `/api/watchlist`, `/api/alerts`, `/api/portfolio[...]`), error rules.
- Replaced `prisma/schema.prisma`: Stock, DailyPrice (252 bars/stock), NewsItem, WatchlistItem, Alert, Position, CashAccount, Trade. Ran `bun run db:push` OK.
- Wrote `prisma/seed.ts` (deterministic GBM daily series ending exactly at current price, macro + company news). Ran seed: 17 stocks, 4,284 daily bars, 25 news, watchlist [ZANACO, ZCCM-IH, ATEL, ZSUG], cash K100,000, sample alert.

Stage Summary:
- DB ready at db/custom.db. Shared config + contract ready.
- Next: parallel build — Task 2-a engine (mini-services/market-engine), Task 2-b Next API (src/app/api/**), Task 3 frontend (src/app/page.tsx + src/components/market/**). Integration & verification afterwards (Task 4).
- Dev conventions: only `/` route visible; client WS via io('/?XTransformPort=3003') path '/'; engine HTTP base http://localhost:3003 server-side only.

---
Task ID: 2-b
Agent: full-stack-developer
Task: Build Next.js API layer (REST routes + engine client)

Work Log:
- Read worklog.md, shared/api-contract.md (binding), prisma/schema.prisma, src/lib/db.ts, shared/luse-stocks.json (meta.fees).
- Created `src/lib/market-engine.ts`: `ENGINE_URL='http://localhost:3003'`, `getEngine<T>(path)` (fetch, AbortSignal.timeout(3000), cache:'no-store', throws typed `EngineError` on network failure / non-2xx / invalid JSON) + shared engine types (EngineSnapshot, EngineQuote, EngineTickStock/EngineTick, EngineCandle(sResponse), EngineOrderBook, EngineNewsItem/Response, EngineSession, EngineIndex).
- Created `src/lib/server-utils.ts` (pure): `round2`, `computeFees(gross)` (= max(0.15%·gross, K5) + 0.05% levy, constants mirror meta.fees), `aggregateCandles(candles, minutes)` (epoch-aligned buckets, OHLC merge, volume sum, ascending). Sanity-tested with throwaway bun script (12 assertions ALL PASS), script deleted — no test files remain.
- Created 12 route files (all `export const dynamic = 'force-dynamic'`, all params awaited as `Promise<...>` per Next 16, all NextResponse.json, all try/catch with JSON errors): stocks passthrough (503 on EngineError), stocks/[symbol] (Prisma profile + 52w high/low via dailyPrice aggregate; 404 checked BEFORE engine fetch), stocks/[symbol]/candles (1m→engine, 5m/1h→server-side aggregateCandles, 1d→Prisma DailyPrice desc-take-reverse, default 252, limit clamped ≤500, t=UTC midnight ms; 400 invalid-interval/limit; 404 unknown symbol), news (Prisma latest 15 + engine latest 25 via Promise.all, sort desc by publishedAt, dedupe by headline, cap limit; engine down → graceful 200 with seeded news only — documented decision), watchlist GET/POST (zod, Stock-exists→404, findUnique dup→409 + P2002 race guard), watchlist/[id] DELETE (404 if missing), alerts GET/POST (zod: symbol/ABOVE|BELOW/targetPrice>0), alerts/[id] DELETE + PATCH ({trigger:true}→triggeredAt=now,active=false | {active:boolean}), portfolio GET (Prisma only, never calls engine; cash/initialCash, positions, trades desc max 50), portfolio/trade POST (zod → Stock check 404 → ONE getEngine('/api/stocks') fetch to find live price (503 if engine down) → computeFees → db.$transaction: BUY checks cash≥gross+fees→400 insufficient-cash else debit + weighted-avg-cost position upsert + Trade; SELL checks position qty→400 insufficient-shares else credit, realizedPnL += (price−avgCost)·qty−fees, delete position at 0 + Trade; 200 {trade, cash, position|null}), portfolio/reset POST (tx: upsert cash→initial 100000, deleteMany positions+trades), health GET {ok:true}.
- Verified: `bun run lint` → 0 errors/warnings; `bunx tsc --noEmit` → clean for all owned files (only pre-existing errors in skills/**, unrelated). Runtime smoke test against running dev server: health 200, watchlist/alerts/portfolio/news/candles-1d 200 with correct shapes, stocks+per-symbol+trade → clean 503 {error:'engine-unavailable'} while engine not yet up; POST watchlist 404/400/409/201 + DELETE 200/404; alerts POST 400 on bad condition; trade 404 unknown symbol / 400 bad qty / 503 engine down; PATCH alert 400 bad body. DB state left untouched (test watchlist row created then deleted).

Stage Summary:
- REST API complete: GET /api/stocks · GET /api/stocks/[symbol] · GET /api/stocks/[symbol]/candles?interval=1m|5m|1h|1d&limit · GET /api/news?limit · GET|POST /api/watchlist · DELETE /api/watchlist/[id] · GET|POST /api/alerts · DELETE|PATCH /api/alerts/[id] · GET /api/portfolio · POST /api/portfolio/trade · POST /api/portfolio/reset · GET /api/health.
- Key decisions: EngineError-typed 503s on all engine-dependent routes; 404 (unknown symbol) checked before engine call; news degrades to seeded-only 200 when engine down; trade does exactly one engine fetch and runs money math in an interactive Prisma tx; 1d candles mapped from Prisma with UTC-midnight ms timestamps; intraday 5m/1h aggregation is a pure, tested function in src/lib/server-utils.ts.
- Ready for engine (Task 2-a) integration on port 3003 and frontend (Task 3) consumption via /api/**.
---
Task ID: 2-a
Agent: general-purpose
Task: Build market engine mini-service (port 3003)

Work Log:
- Read worklog.md, shared/api-contract.md (§1 HTTP + §2 socket.io are the deliverable), shared/luse-stocks.json (17 stocks + meta), examples/websocket/server.ts conventions.
- Created `mini-services/market-engine/package.json` ({name: market-engine, scripts.dev: bun --hot index.ts}) — no bun install (socket.io resolved from root node_modules).
- Created `mini-services/market-engine/index.ts` (~990 lines bun/TS): single node:http server on 3003 serving BOTH REST (manual URL routing, no express) and socket.io (path '/', CORS *).
- State init per stock: price/prevClose from config, dayOpen = prevClose*(1±0.3%), spreadPct 0.1%–0.25% by log-cap liquidity (bigger cap → tighter), σ_tick = (0.15+0.13|β|)*0.015 (pragmatic sim scale, documented), anchor = boot price, cap-weighted LASI weights.
- Boot seeding: 1m candles for current Lusaka session (UTC+2); if within 09:30–15:30 weekday → session open, else 5h virtual session (charts never empty). Per-stock GBM minute walk Brownian-bridged to end EXACTLY at cfg.price; seeds dayHigh/dayLow/volume/valueTraded + index.history. Status OPEN/CLOSED computed live.
- Tick loop 1500ms: GBM + mean reversion to anchor (k=0.004) + 0.5% jumps (±0.4–1.2%) + queued news impacts; volume += rnd 50–15000 × cap scale; valueTraded; bid/ask requote; dir 1|0|-1; LASI = base×Σ(w_i×price_i/anchor_i) with prevClose variant, history capped 2000; USD/ZMW ±0.05% walk with gentle pull to meta rate; broadcasts `tick`.
- Order books regenerated every 3s: 5 bids/5 asks, offsets 0.05%→0.30% (rounding-collision guards keep ladder strict), sizes 100–50000.
- News generator every 45–120s: ~35 Zambia-themed templates (results/dividends/contracts/broker moves per sector + kwacha, BoZ MPC, LME copper, ZESCO load-shedding, rains, T-bills, inflation). Items: id n-<ts>-<rand>, headline, body, source "LuSE Wire", symbols (1–2 or [] macro), sentiment, impact, publishedAt; last 60 kept; `news` broadcast; impact ±0.2–1.5% (HIGH/MED/LOW ranges, macro at 0.5× to whole tape, kwacha items nudge usdRate) queued to next tick. TICK_MS/NEWS_MIN_MS/NEWS_MAX_MS env-overridable for tests.
- REST verified: /health {ok,serverTime,uptimeSec}; /api/stocks full snapshot (incl. session{status,label,lusakaTime}, usdRate, index w/ history, marketCap = price×shares ✓); /api/stocks/:symbol/candles?interval=1m (301 seeded, ascending); /api/stocks/:symbol/orderbook (5+5 levels); /api/news?limit (desc); 404 stock-not-found / 400 invalid-interval / 404 not-found all JSON.
- KEY FIX: socket.io path '/' makes engine.io claim EVERY http request ("Transport unknown"). Patched io.engine.handleRequest to route only genuine EIO requests (URL contains 'EIO=') to engine.io and everything else to the REST handler; WS upgrades unaffected (separate 'upgrade' event).
- Tested via WS probe (temp file, deleted after): snapshot on connect (17 stocks), ≥4 ticks with dir, news events received. Curl t0 vs t0+4s confirmed prices/index/history changed (tick loop live). News test with fast env confirmed symbols tagging (e.g. ["ZSUG","ZMBF"], [] for macro) and `news` event. All processes killed after each run (verified 'ENGINE STOPPED: OK').

Stage Summary:
- Engine DONE at mini-services/market-engine/ (package.json + index.ts), port 3003, contract §1+§2 implemented exactly; only deviation: extra env overrides for intervals (defaults per contract) and 405 on non-GET.
- Engine boot log, /health, /api/stocks, candles, orderbook, news, error cases and socket.io snapshot/tick/news all verified green.
- Next (other agents): Task 2-b Next.js API passthrough (src/lib/market-engine.ts ENGINE_URL=http://localhost:3003), Task 3 frontend via io('/?XTransformPort=3003', {path:'/'}), then Task 4 integration.
---
Task ID: 3
Agent: full-stack-developer
Task: Build frontend terminal UI

Work Log:
- Read worklog.md, shared/api-contract.md, shared/luse-stocks.json, examples/websocket/frontend.tsx before writing code; listed src/components/ui to reuse shadcn primitives.
- Data layer: src/lib/market/types.ts (snapshot/quote/tick/candle/news/alert/portfolio/profile/orderbook types per contract §1–3), format.ts (fmtK/fmtBig/fmtNum/fmtPct/fmtSignedMoney/fmtIndex/fmtTime/fmtTimeSec/fmtDate/fmtDateTime/fmtAgo — all Africa/Lusaka, ZMW "K"), indicators.ts (pure sma/rsi(14, Wilder)/signalFrom), store.ts (zustand: connected/session/usdRate/index+history/stocks/stockOrder/news/selectedSymbol/flash/priceHistory ring-buffer(50); applySnapshot/applyTick merge semantics per contract; store-side 600ms flash setTimeout with timer map).
- Hooks: use-market-socket.ts (io('/?XTransformPort=3003', transports ['websocket','polling'], forceNew, reconnection, cleanup on unmount; snapshot→hydrate, tick→merge+flash+price buffer+index history append, news→prepend, connect/disconnect→status); use-market-bootstrap.ts (REST /api/stocks fallback incl. 6s late retry, /api/news initial + 60s interval, 503→engineDown banner state + retry/dismiss); use-portfolio.ts (GET /api/portfolio, submitTrade→POST /api/portfolio/trade with mapped error toasts + success toast "Bought/Sold N SYM @ K…", resetAccount); use-alert-engine.ts (GET /api/alerts, store-subscription trigger engine — fires each active alert once via locally-fired set, toast "🔔 SYM crossed above/below K…", PATCH {trigger:true}, create/delete with optimistic removal).
- Components (src/components/market/): TerminalApp (root: dark theme on <html> for portal vars, engine-down banner w/ AnimatePresence, desktop 3-col grid [300px|1fr|340px] w/ sticky side columns, mobile <lg Tabs Market/Terminal/Portfolio/News/Alerts with 44px targets, single TradeDialog instance keyed per open), Header (brand, LASI chip + pulsing dot, live Lusaka HH:mm:ss CAT via Intl + LIVE•SIM/AFTER HOURS•SIM badge, USD/ZMW chip, LIVE/SYNC indicator), TickerTape (CSS marquee @keyframes tape 60s, duplicated strip, pause-on-hover, per-item flash + click-select), StocksList (search filter, All|Watchlist tabs, optimistic star POST/DELETE /api/watchlist + toast, sparkline from 50-price ring buffer, keyboard-focusable rows), StockDetail (big mono price w/ flash-up/down + framer-motion, change/pct, day-range bar w/ marker, Buy/Sell, profile fetch for 52W/website), PriceChart (1D=1m AreaChart orange gradient + OHLC tooltip + volume BarChart emerald/rose by c>=o; 1M/3M/1Y=1d ComposedChart close area + thin volume bars, limits 22/66/252, refetch on range/symbol), StatsGrid (2×4: Open/PrevClose/DayHigh/DayLow/Volume/ValueTraded/MarketCap/52W), TechnicalsCard (SMA20/SMA50/RSI14 from 1d closes + BULLISH/BEARISH/NEUTRAL badge), OrderBook (5 bids/asks, depth bars relative to max, 5s poll + on selection), MarketTab (LASI intraday area, breadth adv/unch/dec bars, market-cap-weighted heatmap tiles w/ |pct|-scaled opacity, Top Gainers/Losers/Most Active), PortfolioTab (cash, equity Σ qty×live, P&L vs K100,000, positions table w/ Sell, trade history, AlertDialog reset), AlertsTab (create form symbol/condition/target, active amber-dot vs triggered emerald-check groups, delete), NewsTab (sentiment badges, HIGH/MED/LOW impact dots, clamp-2 body, symbol chips), TradeDialog (side toggle, qty ± 10, quick 10/100/1K/MAX, gross/fees(max(0.15%,K5)+0.05% levy)/total|proceeds, insufficient-cash/shares hints, toasts), Sparkline (pure SVG), Footer (sticky bottom, disclaimer + brand, safe-area padding).
- Files: page.tsx → <TerminalApp/>; layout.tsx metadata → "LuSE Pulse — Zambia Market Terminal"; globals.css appended tape/flash-up/flash-down keyframes, thin ::webkit-scrollbar + .luse-scroll, reduced-motion guard (END only).
- Quality: no ports/absolute URLs in client code (REST relative /api/..., WS via XTransformPort=3003); zustand v5 selector discipline (no fresh array/object refs from selectors — derived via useMemo w/ stable inputs, EMPTY_INDEX_HISTORY constant); no hydration mismatch (clock/times render post-mount, store starts empty → skeletons SSR); aria-labels on all icon buttons, role=list rows, focus-visible rings, live regions on status; loading skeletons + empty + error states on every card.
- Verification: bun run lint → 0 errors 0 warnings (fixed react-hooks/set-state-in-effect by moving mobile-tab jump into store.subscribe callback and re-keying TradeDialog per open instead of effect-reset); tsc --noEmit → 0 errors under src/; dev.log shows GET / 200, /api/watchlist|news|portfolio|alerts 200 consumed, /api/stocks 503 (engine down) handled by banner — no compile errors.

Stage Summary:
- Component tree: page → TerminalApp → {Header, TickerTape, banner, [desktop grid: StocksList | StockDetail(PriceChart, StatsGrid, TechnicalsCard, OrderBook) | SideRail(MarketTab, PortfolioTab, NewsTab, AlertsTab)], Footer, TradeDialog} / [mobile tabs]. 17 market components + 4 hooks + 4 lib modules.
- Design: dark Bloomberg-style (#0a0a0b bg, zinc-900/60 panels, zinc-800 borders), Zambia orange (#EF7D00/orange-500) accents, emerald/rose/zinc for up/down/flat, Geist Mono tabular figures everywhere, sticky footer with mt-auto, 44px touch targets, thin custom scrollbars.
- Data flows: socket snapshot/tick → zustand (flash auto-clear 600ms, price ring buffers 50, index history) → all components via selectors; REST bootstrap fallback + 60s news poll + 5s orderbook poll + on-demand candles/profile/alerts/portfolio; alerts trigger engine watches store prices and PATCHes once; trades POST then refresh portfolio; watchlist optimistic with rollback.
- Integration notes for Task 4: engine socket on 3003 expected (io path '/', Caddy gateway); /api/stocks/[symbol]/orderbook returned 404 and /api/stocks/[symbol] not yet observed 200 while engine down — frontend degrades gracefully (hidden 52W, retry copy); verify tick merge + flash + heatmap once engine serves snapshot/tick; chart 1D needs engine 1m candles.

---
Task ID: 3
Agent: full-stack-developer
Task: Build frontend terminal UI (re-run verification pass)

Work Log:
- Re-verified the complete Task 3 implementation end-to-end against shared/api-contract.md §2–§3 and the task spec: lib layer (types/format/indicators/store), 4 hooks, 17 market components, page.tsx/layout.tsx/globals.css all present and conformant.
- Confirmed socket layer uses io('/?XTransformPort=3003', { transports: ['websocket','polling'], forceNew: true, reconnection: true }) with path '/' (gateway rule) — no ports or absolute URLs anywhere in client code; all REST via relative /api/....
- Confirmed spec coverage: sticky header (brand, LASI chip + pulsing dot, live Lusaka clock client-only, LIVE•SIM/AFTER HOURS•SIM badge, USD/ZMW, connection state); CSS-marquee ticker tape (60s, duplicated strip, pause-on-hover, click-select, tick flash); 3-col desktop grid 300px/1fr/340px with sticky columns + mobile <lg top-level Tabs (Market/Terminal/Portfolio/News/Alerts, 44px targets); stocks list (search, All|Watchlist, optimistic star POST/DELETE + toast, sparklines); detail (big mono price + flash, day-range marker bar, Buy/Sell, 1D/1M/3M/1Y recharts with OHLC tooltip + direction-colored volume, 8-cell stats, SMA20/SMA50/RSI14 + signal badge, order book 5s poll); side rail (LASI intraday, breadth bars, cap-weighted heatmap, Gainers/Losers/Active, portfolio w/ equity + P&L + reset dialog, alerts CRUD + trigger engine, news feed w/ sentiment badges + symbol chips); trade dialog (side toggle, qty stepper + 10/100/1K/MAX, fee breakdown max(0.15%,K5)+0.05% levy, toasts, portfolio refresh).
- Quality gates re-run: bun run lint → 0 errors 0 warnings; bunx tsc --noEmit → 0 errors under src/ (only pre-existing errors in mini-services/market-engine/index.ts [Task 2-a scope] and skills/** — outside Task 3 ownership, untouched).
- dev.log reviewed: no compile errors; REST bootstrap consumed (watchlist/news/portfolio/alerts 200), /api/stocks 503 + orderbook 404 while engine down handled by dismissible banner + graceful empty states. No dev server or build run per instructions.

Stage Summary:
- Frontend complete and lint/type-clean; no code changes required in this pass. Component tree, data flows and design system as recorded in the Task 3 entry above.
- Integration notes stand: once the engine serves snapshot/tick on 3003, live flash/heatmap/1D chart hydrate automatically; frontend degrades gracefully while it is down.

---
Task ID: 4
Agent: main coordinator (Z.ai Code)
Task: Integration, bug fixing, end-to-end verification with agent-browser.

Work Log:
- Started market engine (mini-services/market-engine, bun --hot, port 3003) via setsid nohup — NOTE: plain `&` processes die with the tool shell; use setsid.
- Fixed hydration error: Skeleton (div) nested inside <p> in StockDetail.tsx → changed to div.
- Added missing Next route `GET /api/stocks/[symbol]/orderbook` (contract gap; frontend hit 404s). Extended EngineError with `status` field in src/lib/market-engine.ts for correct 404 vs 503 mapping.
- Fixed footer overlap: sticky left/right rail wrappers used max-h without height/flex so inner lists overflowed main → `lg:h-[calc(100vh-97px)] lg:flex lg:flex-col lg:overflow-hidden`; mobile wrapper max-h→h-[62vh]. Verified mainBottom == footerTop (overlap 0).
- Fixed stock-row truncation: removed sector chip, sparkline 44×20, star 28px, price col 72px, left column 300→320px.
- Removed Mkt Value column from Portfolio positions table (was clipped in 340px rail); P&L column now whitespace-nowrap.
- Made engine-down recovery continuous: bootstrap hook retries /api/stocks every 8s while store empty.
- Realism tuning: config prevCloses now ±1.8% of price; engine MEAN_REVERSION_K 0.004→0.03, SIGMA_STEP_SCALE 0.015→0.011, JUMP_PROB 0.005→0.002 → max |day change| now ~±1.7% after minutes of ticks.
- Agent-browser E2E verified via gateway :81 (NOT :3000 — socket.io needs Caddy XTransformPort routing): live ticks/tape, stock select, 1D+1M charts, BUY 100 ZSUG @K71.42 (cash 92,843.72 server-verified), SELL 100 ZSUG (round-trip realized, positions cleared), alert ZSUG>K70 created→triggered→toast→PATCH, watchlist star toggle server-verified, News feed with live engine headlines, mobile 390px: no h-scroll, tabs work, footer pushed down. Zero console/page errors, zero dev.log errors, bun run lint clean.

Stage Summary:
- App COMPLETE and verified: real-time LuSE terminal (17 real companies, LASI index, USD/ZMW) with socket.io live ticks, REST fallback, charts (1D/1M/3M/1Y), technicals (SMA20/50, RSI14, signal), order book depth, cap-weighted heatmap, breadth, movers, watchlist, alerts engine, paper-trading portfolio (K100k, fees 0.15% min K5 + 0.05% levy), live+seeded news.
- Runbook: dev server `bun run dev` (3000); engine `cd mini-services/market-engine && bun run dev` (3003, MUST be running for live data); preview via Caddy :81.
- Known minor: Zanaco/StanChart tickers use commonly-cited LuSE abbreviations; brand text truncates on very small phones; light theme not implemented (dark terminal by design).
