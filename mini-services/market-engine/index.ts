/**
 * LuSE Market Engine — in-memory real-time simulation of the Lusaka
 * Securities Exchange for the Zambia market terminal.
 *
 * ONE http server (port 3003) serves both the REST API (shared/api-contract.md
 * §1) and the socket.io event stream (§2, path '/'). Socket.io attaches to the
 * same server and hands non-socket.io requests through to the handler below.
 *
 * Run: bun index.ts   |   dev: bun --hot index.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { Server } from 'socket.io'

// Standard TS-friendly equivalent of bun's `import.meta.dir`.
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Tuning constants. TICK_MS / NEWS_* are env-overridable so integration tests
// can speed the sim up; defaults follow the contract.
// ---------------------------------------------------------------------------
const PORT = 3003
const TICK_MS = Number(process.env.TICK_MS ?? 1_500)
const BOOK_MS = 3_000
const NEWS_MIN_MS = Number(process.env.NEWS_MIN_MS ?? 45_000)
const NEWS_MAX_MS = Number(process.env.NEWS_MAX_MS ?? 120_000)
const INDEX_HISTORY_CAP = 2_000
const CANDLE_CAP = 1_500 // safety cap (~a full day of 1m bars)
const NEWS_CAP = 60
const VIRTUAL_SESSION_HOURS = 5 // candles seeded backwards when market is closed
const SESSION_LABEL = 'LuSE Live Session (SIM)'

// Session persistence — the engine restores today's in-progress session after
// a restart instead of re-seeding a fresh virtual one, so live charts, the
// tape, day stats and the news log survive process restarts.
const PERSIST_MS = 15_000
const PERSIST_DB_PATH = join(ENGINE_DIR, '../../db/custom.db')

/** Pragmatic scale mapping annualised vol onto one sim step (tick/minute). */
const SIGMA_STEP_SCALE = 0.011
/** Weak pull of log-price back toward the boot anchor, per tick (k). */
const MEAN_REVERSION_K = 0.03
/** Probability of a ±0.4%–1.2% jump per stock per tick. */
const JUMP_PROB = 0.002

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StockCfg {
  symbol: string
  name: string
  sector: string
  price: number
  prevClose: number
  sharesOutstanding: number
  peRatio: number
  dividendYield: number
  eps: number
  beta: number
  website: string
  description: string
}

interface UniverseMeta {
  exchange: string
  exchangeCode: string
  country: string
  indexName: string
  indexCode: string
  indexValue: number
  currency: { code: string; symbol: string; name: string }
  usdRate: number
  session: {
    openHourLocal: number
    openMinLocal: number
    closeHourLocal: number
    closeMinLocal: number
    tz: string
    utcOffsetMinutes: number
  }
  fees: { commissionPct: number; minCommissionZMW: number; levyPct: number }
}

interface Universe {
  meta: UniverseMeta
  stocks: StockCfg[]
}

type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
type Impact = 'HIGH' | 'MEDIUM' | 'LOW'

interface Candle {
  t: number // epoch ms, start of the minute bucket
  o: number
  h: number
  l: number
  c: number
  v: number
}

interface BookLevel {
  price: number
  size: number
}

interface NewsItem {
  id: string
  headline: string
  body: string
  source: string
  symbols: string[]
  sentiment: Sentiment
  impact: Impact
  publishedAt: string
}

/** Internal news shape before id/source/publishedAt are attached. */
type RawNews = {
  headline: string
  body: string
  sentiment: Sentiment
  impact: Impact
  symbols?: string[]
  /** Optional instantaneous kwacha nudge (fractional, e.g. -0.002). */
  usdDelta?: number
}

interface StockState {
  cfg: StockCfg
  price: number
  prevClose: number
  dayOpen: number
  dayHigh: number
  dayLow: number
  volume: number
  valueTraded: number
  bid: number
  ask: number
  /** Boot reference price for mean reversion & index weights. */
  anchor: number
  /** Half-spread denominator: bid/ask = price ∓ price*spreadPct/2. */
  spreadPct: number
  /** Per-tick log-return std dev, derived from beta. */
  sigmaTick: number
  /** Multiplier on the 50–15 000 random tick volume, by market cap. */
  volScale: number
  /** Cap weight in LASI, normalised at boot. */
  weight: number
  dir: 1 | 0 | -1
  candles: Candle[] // ascending by t
  book: { bids: BookLevel[]; asks: BookLevel[] }
  lastUpdate: string
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------
const round2 = (x: number): number => Math.round(x * 100) / 100
const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const chance = (p: number): boolean => Math.random() < p

/** Standard normal sample (Box–Muller). */
function gauss(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// Universe & boot state
// ---------------------------------------------------------------------------
const universe = JSON.parse(
  readFileSync(join(ENGINE_DIR, '../../shared/luse-stocks.json'), 'utf8'),
) as Universe
const meta = universe.meta
const indexBase = meta.indexValue
const TZ_OFFSET_MIN = meta.session.utcOffsetMinutes // Lusaka = UTC+2, no DST

const bootMs = Date.now()
/** Timestamp of the last engine tick — surfaced via /health for liveness checks. */
let lastTickAt = 0
let usdRate = meta.usdRate

const caps = universe.stocks.map((s) => s.price * s.sharesOutstanding)
const minCap = Math.min(...caps)
const maxCap = Math.max(...caps)
const totalCap = caps.reduce((a, b) => a + b, 0)

const stockBySymbol = new Map<string, StockState>()
const stocks: StockState[] = universe.stocks.map((cfg, i) => {
  // Liquidity proxy in [0,1]: log market-cap rank. Bigger cap → tighter spread.
  const liquidity = maxCap > minCap ? Math.log(caps[i] / minCap) / Math.log(maxCap / minCap) : 1
  const sigmaAnnual = 0.15 + 0.13 * Math.abs(cfg.beta)
  const st: StockState = {
    cfg,
    price: cfg.price,
    prevClose: cfg.prevClose,
    dayOpen: round2(cfg.prevClose * (1 + (chance(0.5) ? 1 : -1) * rnd(0, 0.003))),
    dayHigh: cfg.price,
    dayLow: cfg.price,
    volume: 0,
    valueTraded: 0,
    bid: cfg.price,
    ask: cfg.price,
    anchor: cfg.price,
    spreadPct: 0.0025 - 0.0015 * liquidity, // 0.1%–0.25%
    sigmaTick: sigmaAnnual * SIGMA_STEP_SCALE,
    volScale: 0.25 + 1.75 * liquidity,
    weight: caps[i] / totalCap,
    dir: 0,
    candles: [],
    book: { bids: [], asks: [] },
    lastUpdate: new Date(bootMs).toISOString(),
  }
  st.bid = Math.max(0.01, round2(st.price * (1 - st.spreadPct / 2)))
  st.ask = round2(st.price * (1 + st.spreadPct / 2))
  stockBySymbol.set(cfg.symbol, st)
  return st
})

const indexHistory: { t: number; v: number }[] = []
const newsLog: NewsItem[] = [] // newest first
const pendingImpacts = new Map<string, number>() // symbol → next-tick jump (fractional)

// ---------------------------------------------------------------------------
// Session persistence — bun:sqlite-backed single-row JSON blob in db/custom.db
// ---------------------------------------------------------------------------
interface PersistBlob {
  savedAt: string
  lusakaDate: string
  usdRate: number
  stocks: Record<
    string,
    {
      price: number
      dayOpen: number
      dayHigh: number
      dayLow: number
      volume: number
      valueTraded: number
      anchor: number
      candles: Candle[]
    }
  >
  indexHistory: { t: number; v: number }[]
  newsLog: NewsItem[]
}

let persistDb: Database | null = null
try {
  persistDb = new Database(PERSIST_DB_PATH, { create: true })
  persistDb.run(
    'CREATE TABLE IF NOT EXISTS engine_state (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL, saved_at TEXT NOT NULL)',
  )
  console.log(`[engine] persistence ready at ${PERSIST_DB_PATH}`)
} catch (err) {
  // Persistence is best-effort — never block the engine on DB problems.
  persistDb = null
  console.error('[engine] persistence disabled (db open failed):', err)
}

function lusakaDateStr(ts: number): string {
  const p = lusakaParts(ts) // hoisted-use safe: function declarations bind early
  return `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}`
}

function saveState(): void {
  if (!persistDb) return
  try {
    const blob: PersistBlob = {
      savedAt: new Date().toISOString(),
      lusakaDate: lusakaDateStr(Date.now()),
      usdRate,
      stocks: Object.fromEntries(
        stocks.map((s) => [
          s.cfg.symbol,
          {
            price: s.price,
            dayOpen: s.dayOpen,
            dayHigh: s.dayHigh,
            dayLow: s.dayLow,
            volume: s.volume,
            valueTraded: s.valueTraded,
            anchor: s.anchor,
            candles: s.candles.slice(-CANDLE_CAP),
          },
        ]),
      ),
      indexHistory: indexHistory.slice(-INDEX_HISTORY_CAP),
      newsLog: newsLog.slice(0, NEWS_CAP),
    }
    persistDb.run(
      'INSERT OR REPLACE INTO engine_state (id, value, saved_at) VALUES (1, ?, ?)',
      [JSON.stringify(blob), blob.savedAt],
    )
  } catch (err) {
    console.error('[engine] state save failed:', err)
  }
}

/**
 * Restore today's session from the last save. Returns false (fresh session)
 * when nothing is stored, the DB is unavailable, or the snapshot is from a
 * different Lusaka calendar day.
 */
function restoreState(): boolean {
  if (!persistDb) return false
  try {
    const row = persistDb
      .query('SELECT value FROM engine_state WHERE id = 1')
      .get() as { value: string } | null
    if (!row?.value) return false
    const blob = JSON.parse(row.value) as PersistBlob
    if (blob.lusakaDate !== lusakaDateStr(Date.now())) return false
    if (!blob.stocks || typeof blob.usdRate !== 'number') return false

    let restoredAny = false
    for (const s of stocks) {
      const saved = blob.stocks[s.cfg.symbol]
      if (!saved || !Array.isArray(saved.candles) || saved.candles.length === 0) continue
      s.price = round2(saved.price)
      s.dayOpen = round2(saved.dayOpen)
      s.dayHigh = round2(saved.dayHigh)
      s.dayLow = round2(saved.dayLow)
      s.volume = Math.max(0, Math.floor(saved.volume))
      s.valueTraded = Number(saved.valueTraded) || 0
      s.anchor = Number(saved.anchor) > 0 ? Number(saved.anchor) : s.cfg.price
      s.dir = 0
      s.candles = saved.candles.slice(-CANDLE_CAP)
      s.lastUpdate = new Date().toISOString()
      restoredAny = true
    }
    if (!restoredAny) return false

    usdRate = blob.usdRate
    if (Array.isArray(blob.indexHistory)) {
      indexHistory.push(...blob.indexHistory.slice(-INDEX_HISTORY_CAP))
    }
    if (Array.isArray(blob.newsLog)) {
      newsLog.push(...blob.newsLog.slice(0, NEWS_CAP))
    }
    console.log(
      `[engine] restored today's session (${blob.savedAt}) — ${indexHistory.length} index pts, ${newsLog.length} news items`,
    )
    return true
  } catch (err) {
    console.error('[engine] state restore failed, starting fresh:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Lusaka session helpers (UTC+2 fixed offset)
// ---------------------------------------------------------------------------
interface LusakaParts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
  dow: number
}

function lusakaParts(ts: number): LusakaParts {
  const d = new Date(ts + TZ_OFFSET_MIN * 60_000)
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    dow: d.getUTCDay(),
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

function lusakaClock(ts: number): string {
  const p = lusakaParts(ts)
  return `${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`
}

/** OPEN on weekdays 09:30–15:30 Lusaka, else CLOSED. */
function isInSession(ts: number): boolean {
  const p = lusakaParts(ts)
  if (p.dow === 0 || p.dow === 6) return false
  const mins = p.h * 60 + p.mi
  const open = meta.session.openHourLocal * 60 + meta.session.openMinLocal
  const close = meta.session.closeHourLocal * 60 + meta.session.closeMinLocal
  return mins >= open && mins < close
}

// ---------------------------------------------------------------------------
// Session candle seeding — GBM walk per stock, bridged to end at cfg.price
// ---------------------------------------------------------------------------
function seedSession(): number {
  const now = Date.now()
  let startMs: number
  if (isInSession(now)) {
    const p = lusakaParts(now)
    const openMinAbs = meta.session.openHourLocal * 60 + meta.session.openMinLocal
    startMs = Date.UTC(p.y, p.mo, p.d) + (openMinAbs - TZ_OFFSET_MIN) * 60_000
  } else {
    // Outside hours / weekend: virtual session so charts are never empty.
    startMs = now - VIRTUAL_SESSION_HOURS * 3_600_000
  }
  const startBucket = Math.floor(startMs / 60_000) * 60_000
  const nowBucket = Math.floor(now / 60_000) * 60_000
  const nMinutes = Math.max(0, Math.round((nowBucket - startBucket) / 60_000))

  // Per-stock minute price paths (index 0..nMinutes). A Brownian-bridge style
  // correction on the log path guarantees the walk ends exactly at cfg.price.
  const paths: number[][] = stocks.map((s) => {
    const path = [s.dayOpen]
    if (nMinutes > 0) {
      const logs = [Math.log(s.dayOpen)]
      for (let m = 1; m <= nMinutes; m++) logs.push(logs[m - 1] + s.sigmaTick * gauss())
      const end = Math.log(s.cfg.price)
      for (let m = 1; m <= nMinutes; m++) {
        path.push(Math.exp(logs[m] + ((end - logs[nMinutes]) * m) / nMinutes))
      }
    }
    return path
  })

  // Build 1m candles + running volume/valueTraded, and day high/low.
  stocks.forEach((s, i) => {
    const p = paths[i]
    for (let m = 0; m <= nMinutes; m++) {
      const t = startBucket + m * 60_000
      const o = round2(m === 0 ? p[0] : p[m - 1])
      const c = round2(p[m])
      const h = round2(Math.max(o, c) * (1 + rnd(0, 0.0015)))
      const l = round2(Math.min(o, c) * (1 - rnd(0, 0.0015)))
      const v = Math.max(1, Math.floor(rnd(50, 15_000) * s.volScale))
      s.candles.push({ t, o, h, l, c, v })
      s.volume += v
      s.valueTraded += v * c
    }
    s.dayHigh = round2(Math.max(...s.candles.map((c) => c.h), s.price))
    s.dayLow = round2(Math.min(...s.candles.map((c) => c.l), s.price))
  })

  // Seed the index history from the same minute paths.
  for (let m = 0; m <= nMinutes; m++) {
    let rel = 0
    for (let i = 0; i < stocks.length; i++) rel += stocks[i].weight * (paths[i][m] / stocks[i].anchor)
    indexHistory.push({ t: startBucket + m * 60_000, v: round2(indexBase * rel) })
  }
  return nMinutes
}

// ---------------------------------------------------------------------------
// LASI index
// ---------------------------------------------------------------------------
function currentIndexValue(): number {
  let rel = 0
  for (const s of stocks) rel += s.weight * (s.price / s.anchor)
  return round2(indexBase * rel)
}

/** index.prevClose = indexBase × Σ(w_i × prevClose_i / anchor_i). */
const indexPrevCloseValue = round2(
  indexBase *
    stocks.reduce((acc, s) => acc + s.weight * (s.prevClose / s.anchor), 0),
)

// ---------------------------------------------------------------------------
// Order books — regenerated every few seconds, stable in between
// ---------------------------------------------------------------------------
function regenBooks(): void {
  for (const s of stocks) {
    const bids: BookLevel[] = []
    const asks: BookLevel[] = []
    for (let i = 0; i < 5; i++) {
      // Level offsets: level 1 ≈ 0.05%, deepening to ≤ 0.30% at level 5.
      const off = Math.min(0.003, (i + 1) * 0.0005 + rnd(0, 0.0004))
      const bidRef = bids.length ? bids[bids.length - 1].price : s.price
      let bp = round2(s.price * (1 - off))
      if (bp >= bidRef) bp = round2(bidRef - 0.01) // keep ladder strict after rounding
      bids.push({ price: Math.max(0.01, bp), size: 100 + Math.floor(Math.random() * 49_901) })

      const askRef = asks.length ? asks[asks.length - 1].price : s.price
      let ap = round2(s.price * (1 + off))
      if (ap <= askRef) ap = round2(askRef + 0.01)
      asks.push({ price: ap, size: 100 + Math.floor(Math.random() * 49_901) })
    }
    s.book = { bids, asks }
  }
}

// ---------------------------------------------------------------------------
// News — Zambia-themed template generator; news moves prices on next tick
// ---------------------------------------------------------------------------
const IMPACT_RANGE: Record<Impact, readonly [number, number]> = {
  HIGH: [0.008, 0.015],
  MEDIUM: [0.004, 0.009],
  LOW: [0.002, 0.005],
}

type Template = () => RawNews

function companyTemplates(s: StockState): Template[] {
  const sym = s.cfg.symbol
  const nm = s.cfg.name
  const sector = s.cfg.sector
  const generic: Template[] = [
    () => ({
      headline: `${nm} full-year earnings beat consensus as EPS climbs ${rnd(6, 28).toFixed(1)}%`,
      body: `The board credited firmer margins and tight cost control, and signalled an improved final payout. Analysts had modelled slower growth for the ${sector.toLowerCase()} counter.`,
      sentiment: 'POSITIVE',
      impact: 'HIGH',
    }),
    () => ({
      headline: `${nm} flags profit warning: interim earnings to fall up to ${rnd(15, 40).toFixed(0)}%`,
      body: `Management cited input cost inflation and a weaker kwacha on imported stock. The counter opens under pressure when the market next sits.`,
      sentiment: 'NEGATIVE',
      impact: 'HIGH',
    }),
    () => ({
      headline: `${nm} declares interim dividend of K${round2(s.price * rnd(0.02, 0.09))} per share`,
      body: `The payout is payable in about 45 days to shareholders on the register. The yield remains among the more defensive stories on the LuSE.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
    }),
    () => ({
      headline: `Broker lifts ${sym} target price to K${round2(s.price * rnd(1.06, 1.22))} on valuation appeal`,
      body: `A Lusaka-based research desk moved the counter to BUY, noting cheap relative earnings and improving liquidity in the stock.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
    }),
    () => ({
      headline: `Analysts cut ${sym} to UNDERWEIGHT on margin pressure`,
      body: `The desk flagged softening volumes and rising finance costs into the next reporting season, trimming its target price accordingly.`,
      sentiment: 'NEGATIVE',
      impact: 'MEDIUM',
    }),
    () => ({
      headline: `${nm} wins K${rnd(12, 480).toFixed(0)}m supply contract, guides to stronger H2 volumes`,
      body: `The multi-year award covers deliveries across Lusaka and the Copperbelt. Management said ramp-up begins this quarter.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
    }),
    () => ({
      headline: `${nm} AGM approves K${rnd(20, 900).toFixed(0)}m capex programme`,
      body: `Shareholders endorsed the expansion plan with minor amendments. Execution timelines were left unchanged.`,
      sentiment: 'NEUTRAL',
      impact: 'LOW',
    }),
  ]

  const bySector: Record<string, Template[]> = {
    Mining: [
      () => ({
        headline: `Copper cathode output up ${rnd(4, 18).toFixed(1)}% as smelter utilisation improves`,
        body: `Higher throughputs across the Copperbelt lifted royalty flows to the group. Management maintained full-year production guidance.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Soft cobalt and emerald prices squeeze mining royalties`,
        body: `Lower realised prices on secondary minerals offset the copper tailwind. Group revenue guidance was trimmed slightly.`,
        sentiment: 'NEGATIVE',
        impact: 'MEDIUM',
      }),
    ],
    Energy: [
      () => ({
        headline: `CEC signs revised bulk supply agreement with ZESCO, tariff gap narrows`,
        body: `The new structure improves cost-reflectivity on Copperbelt transmission. Analysts see clearer earnings visibility through next year.`,
        sentiment: 'POSITIVE',
        impact: 'HIGH',
      }),
      () => ({
        headline: `ZESCO load-shedding hours extended, dispatch volumes to fall ${rnd(3, 12).toFixed(1)}%`,
        body: `Low water levels at Kariba continue to constrain generation. Energy users on the Copperbelt face longer outage windows this month.`,
        sentiment: 'NEGATIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Partial Power Purchase Programme onboards ${rnd(60, 220).toFixed(0)}MW of solar`,
        body: `New independent capacity should ease outage hours for industrial customers. Ratings agencies view the reform as credit-positive.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
    ],
    Telecommunications: [
      () => ({
        headline: `Airtel Money transactions jump ${rnd(9, 35).toFixed(1)}%, data revenue firms`,
        body: `Mobile money float balances hit a new high as adoption deepens in rural provinces. The operator reaffirmed its capex plan.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Regulator caps data tariffs, ARPU outlook trimmed`,
        body: `ZICTA's new pricing framework compresses headline data rates. Brokers see modest near-term revenue risk for the tower-heavy operator.`,
        sentiment: 'NEGATIVE',
        impact: 'MEDIUM',
      }),
    ],
    Banking: [
      () => ({
        headline: `NPL ratio improves to ${rnd(3.5, 9.5).toFixed(1)}% as provisioning eases`,
        body: `Asset quality continues to recover on restructured corporate books. Credit costs should fall into the next reporting season.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Corporate lending margins compress as kwacha volatility fades`,
        body: `Tighter spreads on USD-linked facilities offset cheaper funding. Treasury income remains supported by the T-bill book.`,
        sentiment: 'NEGATIVE',
        impact: 'LOW',
      }),
    ],
    'Consumer Staples': [
      () => ({
        headline: `Nakambala crush ramps up, output guidance raised ${rnd(3, 12).toFixed(1)}%`,
        body: `Good irrigation water and cane age profile support the upgrade. Regional export allocations into COMESA were raised.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Maize price slump eases feed costs for agro-processors`,
        body: `A bumper harvest has pulled grain prices to multi-season lows. Margins should benefit through the next two quarters.`,
        sentiment: 'POSITIVE',
        impact: 'LOW',
      }),
      () => ({
        headline: `Excise duty hike looms for opaque beer, volumes at risk`,
        body: `Proposed fiscal changes would lift excise on traditional beverages. Brewers warn of price pass-through in informal markets.`,
        sentiment: 'NEGATIVE',
        impact: 'MEDIUM',
      }),
    ],
    'Consumer Discretionary': [
      () => ({
        headline: `Retail turnover up ${rnd(4, 15).toFixed(1)}% as Usave-style expansion deepens`,
        body: `Footfall improved across Lusaka and the Copperbelt with local sourcing now above target. Group kept its store rollout plan.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Retail footfall softens on subdued consumer spending`,
        body: `Discretionary baskets were weaker month-on-month, though basics held up. Management maintained full-year guidance.`,
        sentiment: 'NEGATIVE',
        impact: 'LOW',
      }),
    ],
    Industrials: [
      () => ({
        headline: `Cement dispatches up ${rnd(5, 16).toFixed(1)}% on Copperbelt–DRC corridor demand`,
        body: `Infrastructure works and mine construction underpin volumes. Dispatches into the DRC reached a period high.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
      () => ({
        headline: `Timber auction clears at premium prices as orderbook swells`,
        body: `Export demand for treated pine remains firm. Plantation replanting stays ahead of schedule.`,
        sentiment: 'POSITIVE',
        impact: 'MEDIUM',
      }),
    ],
    'Real Estate': [
      () => ({
        headline: `Occupancy at flagship retail assets lifts to ${rnd(78, 96).toFixed(0)}%`,
        body: `New leases were signed at re-rated rentals after refurbishments. Management flagged further tenant interest in Q4.`,
        sentiment: 'POSITIVE',
        impact: 'LOW',
      }),
    ],
  }

  return [...generic, ...(bySector[sector] ?? [])]
}

function macroTemplates(): Template[] {
  return [
    () => ({
      headline: `Kwacha firms to K${(usdRate - rnd(0.05, 0.35)).toFixed(2)} per USD as copper receipts surge`,
      body: `Dealers cited strong mining-sector dollar sales and improved BoZ supply. The local unit posted its best session in weeks.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
      symbols: [],
      usdDelta: -rnd(0.001, 0.003),
    }),
    () => ({
      headline: `Kwacha slips to K${(usdRate + rnd(0.05, 0.35)).toFixed(2)}/USD on import demand`,
      body: `Energy and fertiliser importers dominated the ask side while offshore flows slowed. Traders expect range-bound trade near term.`,
      sentiment: 'NEGATIVE',
      impact: 'MEDIUM',
      symbols: [],
      usdDelta: rnd(0.001, 0.003),
    }),
    () => ({
      headline: `Bank of Zambia holds policy rate at ${rnd(8.5, 10.5).toFixed(2)}%`,
      body: `The MPC kept a data-dependent stance as disinflation progresses. Analysts see room for easing later in the cycle.`,
      sentiment: 'NEUTRAL',
      impact: 'MEDIUM',
      symbols: [],
    }),
    () => ({
      headline: `BoZ cuts policy rate by 25bps as inflation cools`,
      body: `The committee noted easing food prices and a stable kwacha. Commercial banks are expected to follow with lower lending rates.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
      symbols: [],
    }),
    () => ({
      headline: `Copper jumps ${rnd(1.2, 3.6).toFixed(1)}% on LME as Chinese stimulus lifts sentiment`,
      body: `Base metals rallied across the board with zinc and cobalt also firmer. Zambian mining revenue forecasts were revised up.`,
      sentiment: 'POSITIVE',
      impact: 'HIGH',
      symbols: ['ZCCM-IH'],
    }),
    () => ({
      headline: `LME copper falls ${rnd(1.0, 2.8).toFixed(1)}% on a stronger dollar`,
      body: `Profit-taking hit industrial metals after last week's rally. Mining counters on the LuSE opened softer in sympathy.`,
      sentiment: 'NEGATIVE',
      impact: 'MEDIUM',
      symbols: ['ZCCM-IH'],
    }),
    () => ({
      headline: `ZESCO extends load-shedding to ${rnd(8, 14).toFixed(0)} hours daily amid low Kariba levels`,
      body: `The utility cited falling reservoir inflows and constrained imports. Households and small businesses face longer outage windows.`,
      sentiment: 'NEGATIVE',
      impact: 'HIGH',
      symbols: [],
    }),
    () => ({
      headline: `Monthly inflation eases to ${rnd(6.8, 9.6).toFixed(1)}% – CSO`,
      body: `Food and transport driven prints cooled for a third straight month. The mix keeps the BoZ easing path intact.`,
      sentiment: 'NEUTRAL',
      impact: 'LOW',
      symbols: [],
    }),
    () => ({
      headline: `Met Office forecasts normal-to-above-normal rains for the coming farming season`,
      body: `La Niña conditions favour strong rainfall across southern provinces. Agribusiness counters should benefit from the outlook.`,
      sentiment: 'POSITIVE',
      impact: 'MEDIUM',
      symbols: ['ZSUG', 'ZMBF'],
    }),
    () => ({
      headline: `LuSE turnover hits K${rnd(8, 95).toFixed(1)}m as foreign investors return`,
      body: `Mining and telecom counters dominated the value traded. The bourse has now posted net foreign inflows for a third week.`,
      sentiment: 'NEUTRAL',
      impact: 'LOW',
      symbols: [],
    }),
    () => ({
      headline: `T-bill yields ease ${rnd(10, 60).toFixed(0)}bps at BoZ auction as liquidity improves`,
      body: `Bid coverage firmed across the 91-day and 182-day tenors. Lower government funding costs should filter to bank margins.`,
      sentiment: 'POSITIVE',
      impact: 'LOW',
      symbols: [],
    }),
    () => ({
      headline: `Fuel pump prices held as Indeni pipeline flows normalise`,
      body: `The energy regulator left petrol and diesel unchanged this month. Distributors see steadier working-capital planning ahead.`,
      sentiment: 'NEUTRAL',
      impact: 'LOW',
      symbols: ['PUMA'],
    }),
  ]
}

/** Renders a random Zambia-themed headline. */
function generateNews(): NewsItem {
  const finalize = (raw: RawNews, symbols: string[]): NewsItem => {
    // Kwacha headlines nudge the FX rate immediately.
    if (raw.usdDelta !== undefined) {
      usdRate = round2(Math.min(60, Math.max(5, usdRate * (1 + raw.usdDelta))))
    }
    return {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      headline: raw.headline,
      body: raw.body,
      source: 'LuSE Wire',
      symbols,
      sentiment: raw.sentiment,
      impact: raw.impact,
      publishedAt: new Date().toISOString(),
    }
  }

  if (chance(0.55)) {
    // Company news: always tagged with the related symbol (sometimes a peer).
    const s = pick(stocks)
    const symbols = chance(0.15) ? [s.cfg.symbol, pick(stocks).cfg.symbol] : [s.cfg.symbol]
    return finalize(pick(companyTemplates(s))(), symbols)
  }
  // Macro news: templates either tag related symbols or stay [] for macro.
  const raw = pick(macroTemplates())()
  return finalize(raw, raw.symbols ?? [])
}

/** Queue an immediate price jump for the affected stocks (applied next tick). */
function applyNewsImpact(item: NewsItem): void {
  const sign =
    item.sentiment === 'POSITIVE' ? 1 : item.sentiment === 'NEGATIVE' ? -1 : chance(0.5) ? 1 : -1
  const [lo, hi] = IMPACT_RANGE[item.impact]
  const base = rnd(lo, hi)
  const marketWide = item.symbols.length === 0
  // Macro news (no symbols) moves the whole tape at roughly half strength.
  const targets = marketWide ? stocks.map((s) => s.cfg.symbol) : item.symbols
  const scale = marketWide ? 0.5 : 1
  for (const symbol of targets) {
    const pct = sign * base * scale * rnd(0.6, 1.4)
    pendingImpacts.set(symbol, (pendingImpacts.get(symbol) ?? 0) + pct)
  }
}

function emitNews(): void {
  const item = generateNews()
  applyNewsImpact(item)
  newsLog.unshift(item)
  if (newsLog.length > NEWS_CAP) newsLog.pop()
  io.emit('news', item)
  console.log(`[news] (${item.sentiment}/${item.impact}) ${item.headline}`)
}

function scheduleNews(): void {
  const delay = rnd(NEWS_MIN_MS, NEWS_MAX_MS)
  newsTimer = setTimeout(() => {
    emitNews()
    scheduleNews()
  }, delay)
}

// ---------------------------------------------------------------------------
// Tick loop
// ---------------------------------------------------------------------------
function tickVolume(s: StockState): number {
  return Math.max(1, Math.floor(rnd(50, 15_000) * s.volScale))
}

function tick(): void {
  lastTickAt = Date.now()
  const now = Date.now()
  const bucket = Math.floor(now / 60_000) * 60_000

  for (const s of stocks) {
    // 1) Price: GBM step + weak mean reversion + rare jump + queued news impact.
    const pending = pendingImpacts.get(s.cfg.symbol)
    if (pending !== undefined) pendingImpacts.delete(s.cfg.symbol)
    const reversion = MEAN_REVERSION_K * Math.log(s.anchor / s.price)
    const jump = chance(JUMP_PROB) ? (chance(0.5) ? -1 : 1) * rnd(0.004, 0.012) : 0
    const ret = reversion + s.sigmaTick * gauss() + jump + (pending ?? 0)

    const prev = s.price
    s.price = round2(Math.max(0.01, s.price * Math.exp(ret)))
    if (s.price > s.dayHigh) s.dayHigh = s.price
    if (s.price < s.dayLow) s.dayLow = s.price
    s.dir = s.price > prev ? 1 : s.price < prev ? -1 : 0

    // 2) Volume & value traded.
    const vol = tickVolume(s)
    s.volume += vol
    s.valueTraded += vol * s.price

    // 3) Re-quote bid/ask around the new price with a little jitter.
    const half = s.price * (s.spreadPct / 2) * rnd(0.85, 1.15)
    s.bid = round2(s.price - half)
    if (s.bid >= s.price) s.bid = round2(s.price - 0.01)
    s.bid = Math.max(0.01, s.bid)
    s.ask = round2(s.price + half)
    if (s.ask <= s.price) s.ask = round2(s.price + 0.01)
    s.lastUpdate = new Date(now).toISOString()

    // 4) Live 1m candle bucket.
    const last = s.candles[s.candles.length - 1]
    if (last && last.t === bucket) {
      last.c = s.price
      if (s.price > last.h) last.h = s.price
      if (s.price < last.l) last.l = s.price
      last.v += vol
    } else {
      s.candles.push({ t: bucket, o: s.price, h: s.price, l: s.price, c: s.price, v: vol })
      if (s.candles.length > CANDLE_CAP) s.candles.shift()
    }
  }

  // 5) USD/ZMW random walk: ±0.05% steps with a gentle pull to the meta anchor.
  usdRate = round2(usdRate * (1 + rnd(-0.0005, 0.0005)) + (meta.usdRate - usdRate) * 0.02)

  // 6) Index point per tick (cap history length).
  const idxValue = currentIndexValue()
  indexHistory.push({ t: now, v: idxValue })
  if (indexHistory.length > INDEX_HISTORY_CAP) {
    indexHistory.splice(0, indexHistory.length - INDEX_HISTORY_CAP)
  }

  io.emit('tick', buildTick(now, idxValue))
}

// ---------------------------------------------------------------------------
// Snapshot / payload builders (contract shapes)
// ---------------------------------------------------------------------------
function indexBlock(idxValue: number, withHistory: boolean) {
  const change = round2(idxValue - indexPrevCloseValue)
  return {
    code: meta.indexCode,
    value: idxValue,
    prevClose: indexPrevCloseValue,
    change,
    changePct: round2((change / indexPrevCloseValue) * 100),
    ...(withHistory ? { history: indexHistory } : {}),
  }
}

function stockSnapshot(s: StockState) {
  const change = round2(s.price - s.prevClose)
  return {
    symbol: s.cfg.symbol,
    name: s.cfg.name,
    sector: s.cfg.sector,
    price: s.price,
    prevClose: s.prevClose,
    dayOpen: s.dayOpen,
    dayHigh: s.dayHigh,
    dayLow: s.dayLow,
    change,
    changePct: round2((change / s.prevClose) * 100),
    volume: s.volume,
    valueTraded: round2(s.valueTraded),
    bid: s.bid,
    ask: s.ask,
    marketCap: round2(s.price * s.cfg.sharesOutstanding),
    /** Last ≤60 1m closes — powers the screener trend sparkline. */
    history: s.candles.slice(-60).map((c) => c.c),
    lastUpdate: s.lastUpdate,
  }
}

/** Same object as GET /api/stocks — also emitted on socket connect. */
function getSnapshot() {
  const now = Date.now()
  return {
    serverTime: new Date(now).toISOString(),
    session: {
      status: isInSession(now) ? ('OPEN' as const) : ('CLOSED' as const),
      label: SESSION_LABEL,
      lusakaTime: lusakaClock(now),
    },
    usdRate: round2(usdRate),
    index: indexBlock(currentIndexValue(), true),
    stocks: stocks.map(stockSnapshot),
  }
}

/** Contract §2 tick payload. */
function buildTick(now: number, idxValue: number) {
  return {
    serverTime: new Date(now).toISOString(),
    usdRate: round2(usdRate),
    index: indexBlock(idxValue, false),
    stocks: stocks.map((s) => {
      const change = round2(s.price - s.prevClose)
      return {
        symbol: s.cfg.symbol,
        price: s.price,
        change,
        changePct: round2((change / s.prevClose) * 100),
        dayHigh: s.dayHigh,
        dayLow: s.dayLow,
        volume: s.volume,
        valueTraded: round2(s.valueTraded),
        bid: s.bid,
        ask: s.ask,
        dir: s.dir,
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// HTTP server — node http + manual URL routing (no express), CORS allow-all
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    if (path === '/health') {
      const tickAgeMs = lastTickAt > 0 ? Date.now() - lastTickAt : null
      sendJson(res, 200, {
        ok: true,
        serverTime: new Date().toISOString(),
        uptimeSec: Math.floor((Date.now() - bootMs) / 1000),
        tickAgeMs,
        ticking: tickAgeMs === null ? false : tickAgeMs < 10_000,
        persist: persistDb !== null,
        restoredSession,
      })
      return
    }

    if (path === '/api/stocks') {
      sendJson(res, 200, getSnapshot())
      return
    }

    if (path === '/api/news') {
      const raw = url.searchParams.get('limit')
      let limit = 40
      if (raw !== null) {
        limit = Number(raw)
        if (!Number.isInteger(limit) || limit < 1) {
          sendJson(res, 400, { error: 'invalid-limit' })
          return
        }
      }
      limit = Math.min(limit, NEWS_CAP)
      sendJson(res, 200, { news: newsLog.slice(0, limit) })
      return
    }

    const m = path.match(/^\/api\/stocks\/([^/]+)\/(candles|orderbook)$/)
    if (m) {
      const symbol = decodeURIComponent(m[1]).toUpperCase()
      const s = stockBySymbol.get(symbol)
      if (!s) {
        sendJson(res, 404, { error: 'stock-not-found' })
        return
      }
      if (m[2] === 'orderbook') {
        sendJson(res, 200, { symbol: s.cfg.symbol, bids: s.book.bids, asks: s.book.asks })
        return
      }
      const interval = url.searchParams.get('interval') ?? '1m'
      if (interval !== '1m') {
        sendJson(res, 400, { error: 'invalid-interval', message: 'only interval=1m is supported' })
        return
      }
      sendJson(res, 200, { symbol: s.cfg.symbol, interval: '1m', candles: s.candles })
      return
    }

    sendJson(res, 404, { error: 'not-found' })
  } catch (err) {
    console.error('[http] error handling request:', err)
    sendJson(res, 500, { error: 'internal-error' })
  }
}

// ---------------------------------------------------------------------------
// Wire everything together
// ---------------------------------------------------------------------------
const httpServer = createServer(handleRequest)

const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards `/?XTransformPort=3003` here.
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

// With socket.io path '/', engine.io's attach-time `check()`
// (`path === req.url.slice(0, path.length)`) matches EVERY http request, so
// plain REST would end up in engine.io ("Transport unknown") and never reach
// the handler above. Patch the engine.io instance so only genuine socket.io
// requests (they always carry `EIO=` in the query) are handed to engine.io;
// everything else falls through to the REST handler. WebSocket upgrades are
// routed via the server's 'upgrade' event and are not affected by this.
const eioHandleRequest = io.engine.handleRequest.bind(io.engine)
io.engine.handleRequest = (req, res) => {
  if ((req.url ?? '').includes('EIO=')) {
    eioHandleRequest(req, res)
  } else {
    handleRequest(req, res)
  }
}

io.on('connection', (socket) => {
  console.log(`[ws] client connected: ${socket.id}`)
  socket.emit('snapshot', getSnapshot())
  socket.on('disconnect', (reason) => {
    console.log(`[ws] client disconnected: ${socket.id} (${reason})`)
  })
})

let newsTimer: ReturnType<typeof setTimeout> | undefined

// Boot: restore today's session if one was saved, otherwise seed a fresh one.
const restoredSession = restoreState()
const seededMinutes = restoredSession ? 0 : seedSession()
regenBooks()

httpServer.listen(PORT, () => {
  const now = Date.now()
  console.log(`[engine] LuSE market engine listening on :${PORT}`)
  console.log(
    `[engine] session=${isInSession(now) ? 'OPEN' : 'CLOSED'} lusaka=${lusakaClock(now)} ${
      restoredSession
        ? 'restored persisted session'
        : `seeded ${seededMinutes + 1} minute candles/stock`
    }`,
  )
})

setInterval(tick, TICK_MS)
setInterval(regenBooks, BOOK_MS)
setInterval(saveState, PERSIST_MS)
scheduleNews()

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`[engine] ${signal} received, shutting down...`)
  if (newsTimer) clearTimeout(newsTimer)
  saveState()
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
