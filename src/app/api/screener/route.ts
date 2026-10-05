import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineSnapshot } from '@/lib/market-engine'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/screener — one merged row per listed company for the market
 * screener table: live quote fields (engine) + fundamentals + multi-horizon
 * performance (1W/1M/3M, Prisma daily bars).
 *
 * 200 → { asOf, rows: [{ symbol, name, sector, price, prevClose, changePct,
 *          volume, valueTraded, marketCap, peRatio, dividendYield, eps, beta,
 *          sharesOutstanding, fiftyTwoWeekHigh, fiftyTwoWeekLow, sparkline,
 *          chg1w, chg1m, chg3m }] }
 * 503 → { error: 'engine-unavailable' }
 */
export async function GET() {
  try {
    const [snapshot, stocks, ranges] = await Promise.all([
      getEngine<EngineSnapshot>('/api/stocks'),
      db.stock.findMany({
        select: {
          symbol: true,
          name: true,
          sector: true,
          peRatio: true,
          dividendYield: true,
          eps: true,
          beta: true,
          sharesOutstanding: true,
        },
      }),
      db.dailyPrice.groupBy({
        by: ['symbol'],
        _max: { high: true },
        _min: { low: true },
      }),
    ])

    // Last 64 daily closes per symbol → 1W/1M/3M % change vs today's live price.
    const symbols = snapshot.stocks.map((s) => s.symbol)
    const closesArr = await Promise.all(
      symbols.map((symbol) =>
        db.dailyPrice.findMany({
          where: { symbol },
          orderBy: { date: 'desc' },
          take: 64,
          select: { close: true },
        })
      )
    )
    const closes = new Map(symbols.map((symbol, i) => [symbol, closesArr[i].map((c) => c.close)]))

    const perf = (symbol: string, bars: number): number | null => {
      const series = closes.get(symbol)
      if (!series || series.length < bars + 1) return null
      const base = series[bars] // `bars` trading days back (desc order)
      if (!base || base <= 0) return null
      return Math.round(((series[0] - base) / base) * 10000) / 100
    }

    const fundamentals = new Map(stocks.map((s) => [s.symbol, s]))
    const range = new Map(
      ranges.map((r) => [
        r.symbol,
        {
          high: round2(r._max.high ?? 0),
          low: round2(r._min.low ?? 0),
        },
      ]),
    )

    const rows = snapshot.stocks.map((q) => {
      const f = fundamentals.get(q.symbol)
      const r = range.get(q.symbol)
      return {
        symbol: q.symbol,
        name: q.name,
        sector: q.sector,
        price: round2(q.price),
        prevClose: round2(q.prevClose),
        changePct: Math.round(q.changePct * 100) / 100,
        volume: q.volume,
        valueTraded: q.valueTraded,
        marketCap: q.marketCap,
        peRatio: f?.peRatio ?? 0,
        dividendYield: f?.dividendYield ?? 0,
        eps: f?.eps ?? 0,
        beta: f?.beta ?? 1,
        sharesOutstanding: f?.sharesOutstanding ?? 0,
        fiftyTwoWeekHigh: r?.high ?? round2(q.dayHigh),
        fiftyTwoWeekLow: r?.low ?? round2(q.dayLow),
        /** Intraday 1m closes (≤60 pts) for the screener trend column. */
        sparkline: Array.isArray(q.history) ? q.history : [],
        /** Multi-horizon performance (%) vs latest close — null when history is short. */
        chg1w: perf(q.symbol, 5),
        chg1m: perf(q.symbol, 21),
        chg3m: perf(q.symbol, 63),
      }
    })

    return NextResponse.json({ asOf: snapshot.serverTime, rows })
  } catch (err) {
    if (err instanceof EngineError) {
      console.error('GET /api/screener: engine unavailable:', err.message)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }
    console.error('GET /api/screener failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
