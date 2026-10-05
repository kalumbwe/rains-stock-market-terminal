import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineSnapshot } from '@/lib/market-engine'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/screener — one merged row per listed company for the market
 * screener table: live quote fields (engine) + fundamentals (Prisma).
 *
 * 200 → { asOf, rows: [{ symbol, name, sector, price, prevClose, changePct,
 *          volume, valueTraded, marketCap, peRatio, dividendYield, eps, beta,
 *          sharesOutstanding, fiftyTwoWeekHigh, fiftyTwoWeekLow, sparkline }] }
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
