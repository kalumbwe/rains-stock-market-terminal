// Zambia LuSE Market Terminal — market engine HTTP client (SERVER-SIDE ONLY).
//
// The market engine mini-service runs on port 3003 (bun + socket.io).
// Never import this module from client code — use the Next.js REST API
// (/api/...) from the browser instead.

/**
 * Base URL of the market engine mini-service (server-side only).
 */
export const ENGINE_URL = 'http://localhost:3003'

/* ------------------------------------------------------------------ */
/* Shared engine types                                                 */
/* ------------------------------------------------------------------ */

export interface EngineSession {
  status: 'OPEN' | 'CLOSED'
  label: string
  lusakaTime: string
}

export interface EngineIndexPoint {
  t: number
  v: number
}

export interface EngineIndex {
  code: string
  value: number
  prevClose: number
  change: number
  changePct: number
  /** Intraday index history (present in full snapshots only). */
  history?: EngineIndexPoint[]
}

/** A stock row inside GET /api/stocks (full market snapshot). */
export interface EngineQuote {
  symbol: string
  name: string
  sector: string
  price: number
  prevClose: number
  dayOpen: number
  dayHigh: number
  dayLow: number
  change: number
  changePct: number
  volume: number
  valueTraded: number
  bid: number
  ask: number
  marketCap: number
  lastUpdate: string
}

/** Full market snapshot — same JSON shape as socket.io `snapshot` event. */
export interface EngineSnapshot {
  serverTime: string
  session: EngineSession
  usdRate: number
  index: EngineIndex
  stocks: EngineQuote[]
}

/** A stock row inside socket.io `tick` events (compact shape). */
export interface EngineTickStock {
  symbol: string
  price: number
  change: number
  changePct: number
  dayHigh: number
  dayLow: number
  volume: number
  valueTraded: number
  bid: number
  ask: number
  /** 1 = uptick, -1 = downtick, 0 = flat. */
  dir: number
}

export interface EngineTick {
  serverTime: string
  usdRate: number
  index: EngineIndex
  stocks: EngineTickStock[]
}

/** OHLCV candle. `t` = bucket start ms, `v` = volume (int). */
export interface EngineCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface EngineCandlesResponse {
  symbol: string
  interval: string
  candles: EngineCandle[]
}

export interface EngineOrderBookLevel {
  price: number
  size: number
}

export interface EngineOrderBook {
  symbol: string
  bids: EngineOrderBookLevel[]
  asks: EngineOrderBookLevel[]
}

export interface EngineNewsItem {
  id: string
  headline: string
  body: string
  source: string
  symbols: string[]
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  publishedAt: string
}

export interface EngineNewsResponse {
  news: EngineNewsItem[]
}

/* ------------------------------------------------------------------ */
/* Typed error + fetch helper                                          */
/* ------------------------------------------------------------------ */

/** Thrown by getEngine when the engine is unreachable / errors / returns bad JSON. */
export class EngineError extends Error {
  readonly path: string
  readonly status?: number
  readonly cause?: unknown

  constructor(message: string, path: string, status?: number, cause?: unknown) {
    super(message)
    this.name = 'EngineError'
    this.path = path
    this.status = status
    this.cause = cause
  }
}

const ENGINE_TIMEOUT_MS = 3000

/**
 * Server-side fetch helper for the market engine.
 * - 3s hard timeout via AbortSignal.timeout
 * - no HTTP caching
 * - throws EngineError on network failure, non-2xx or invalid JSON
 */
export async function getEngine<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ENGINE_URL}${path}`, {
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    throw new EngineError(`Engine request failed: ${path}`, path, undefined, err)
  }

  if (!res.ok) {
    throw new EngineError(`Engine responded ${res.status} for ${path}`, path, res.status)
  }

  try {
    return (await res.json()) as T
  } catch (err) {
    throw new EngineError(`Engine returned invalid JSON for ${path}`, path, err)
  }
}
