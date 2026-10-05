import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineOrderBook } from '@/lib/market-engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stocks/[symbol]/orderbook — proxied from the market engine.
 * 200 → { symbol, bids, asks } · 404 unknown symbol · 503 engine down.
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

    const book = await getEngine<EngineOrderBook>(
      `/api/stocks/${encodeURIComponent(sym)}/orderbook`,
    )
    return NextResponse.json(book)
  } catch (err) {
    if (err instanceof EngineError) {
      const status = err.status === 404 ? 404 : 503
      console.error(`GET /api/stocks/[symbol]/orderbook:`, err.message)
      return NextResponse.json(
        { error: status === 404 ? 'symbol-not-found' : 'engine-unavailable' },
        { status },
      )
    }
    console.error('GET /api/stocks/[symbol]/orderbook failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
