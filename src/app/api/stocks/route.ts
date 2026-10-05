import { NextResponse } from 'next/server'
import { EngineError, getEngine, type EngineSnapshot } from '@/lib/market-engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stocks — passthrough of engine GET /api/stocks (full market snapshot).
 * 200 → engine snapshot JSON. 503 → { error: 'engine-unavailable' }.
 */
export async function GET() {
  try {
    const snapshot = await getEngine<EngineSnapshot>('/api/stocks')
    return NextResponse.json(snapshot)
  } catch (err) {
    if (err instanceof EngineError) {
      console.error('GET /api/stocks: engine unavailable:', err.message)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }
    console.error('GET /api/stocks failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
