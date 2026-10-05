import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineQuote, type EngineSnapshot } from '@/lib/market-engine'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stocks/[symbol] — live quote (engine) + company profile (Prisma).
 * 200 → { quote, profile } · 404 unknown symbol · 503 engine down.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params
    const sym = (symbol ?? '').trim().toUpperCase()
    if (!sym) {
      return NextResponse.json({ error: 'invalid-symbol' }, { status: 400 })
    }

    const stock = await db.stock.findUnique({ where: { symbol: sym } })
    if (!stock) {
      return NextResponse.json({ error: 'symbol-not-found' }, { status: 404 })
    }

    const agg = await db.dailyPrice.aggregate({
      where: { symbol: sym },
      _max: { high: true },
      _min: { low: true },
    })

    const snapshot = await getEngine<EngineSnapshot>('/api/stocks')
    const quote: EngineQuote | undefined = snapshot.stocks.find(
      (s) => s.symbol === sym,
    )
    if (!quote) {
      // Engine reachable but symbol missing from its universe — treat as unavailable.
      console.error(`GET /api/stocks/${sym}: symbol missing from engine snapshot`)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }

    const profile = {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      description: stock.description,
      sharesOutstanding: stock.sharesOutstanding,
      peRatio: stock.peRatio,
      dividendYield: stock.dividendYield,
      eps: stock.eps,
      beta: stock.beta,
      website: stock.website,
      fiftyTwoWeekHigh: round2(agg._max.high ?? quote.dayHigh),
      fiftyTwoWeekLow: round2(agg._min.low ?? quote.dayLow),
    }

    return NextResponse.json({ quote, profile })
  } catch (err) {
    if (err instanceof EngineError) {
      console.error(`GET /api/stocks/[symbol]: engine unavailable:`, err.message)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }
    console.error('GET /api/stocks/[symbol] failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
