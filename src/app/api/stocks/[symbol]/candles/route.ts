import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineCandlesResponse } from '@/lib/market-engine'
import { aggregateCandles, round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const INTRADAY_INTERVALS = new Set(['1m', '5m', '1h'])
const DEFAULT_DAILY_LIMIT = 252
const MAX_DAILY_LIMIT = 500

/**
 * GET /api/stocks/[symbol]/candles?interval=1m|5m|1h|1d&limit=N
 * - 1m  → engine passthrough
 * - 5m/1h → engine 1m candles aggregated server-side
 * - 1d  → Prisma DailyPrice ascending (default last 252, max 500, t = UTC midnight ms)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params
    const sym = (symbol ?? '').trim().toUpperCase()
    if (!sym) {
      return NextResponse.json({ error: 'invalid-symbol' }, { status: 400 })
    }

    const url = new URL(req.url)
    const interval = (url.searchParams.get('interval') ?? '1m').toLowerCase()
    if (interval !== '1d' && !INTRADAY_INTERVALS.has(interval)) {
      return NextResponse.json(
        { error: 'invalid-interval', allowed: ['1m', '5m', '1h', '1d'] },
        { status: 400 },
      )
    }

    // Optional limit (applies to aggregated intraday + 1d; 1m passthrough slices too).
    let limit: number | null = null
    const limitRaw = url.searchParams.get('limit')
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ error: 'invalid-limit' }, { status: 400 })
      }
      limit = Math.min(parsed, MAX_DAILY_LIMIT)
    }

    const stock = await db.stock.findUnique({
      where: { symbol: sym },
      select: { symbol: true },
    })
    if (!stock) {
      return NextResponse.json({ error: 'symbol-not-found' }, { status: 404 })
    }

    if (interval === '1d') {
      const take = limit ?? DEFAULT_DAILY_LIMIT
      const rows = await db.dailyPrice.findMany({
        where: { symbol: sym },
        orderBy: { date: 'desc' },
        take,
      })
      const candles = rows
        .reverse() // ascending by date
        .map((r) => ({
          t: r.date.getTime(), // UTC midnight ms of the trading day
          o: round2(r.open),
          h: round2(r.high),
          l: round2(r.low),
          c: round2(r.close),
          v: Math.round(r.volume),
        }))
      return NextResponse.json({ symbol: sym, interval: '1d', candles })
    }

    // Engine-backed intraday intervals — always fetch 1m from the engine.
    const engineRes = await getEngine<EngineCandlesResponse>(
      `/api/stocks/${encodeURIComponent(sym)}/candles?interval=1m`,
    )
    let candles = Array.isArray(engineRes.candles) ? engineRes.candles : []

    if (interval === '5m') candles = aggregateCandles(candles, 5)
    else if (interval === '1h') candles = aggregateCandles(candles, 60)

    if (limit !== null && candles.length > limit) {
      candles = candles.slice(-limit) // keep the most recent `limit` candles
    }

    return NextResponse.json({ symbol: sym, interval, candles })
  } catch (err) {
    if (err instanceof EngineError) {
      console.error('GET /api/stocks/[symbol]/candles: engine unavailable:', err.message)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }
    console.error('GET /api/stocks/[symbol]/candles failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
