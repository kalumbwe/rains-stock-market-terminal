import { NextResponse } from 'next/server'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAIN_ACCOUNT_ID = 'MAIN'
const FALLBACK_CASH = 100000
const TRADES_LIMIT = 50

/**
 * GET /api/portfolio — paper-trading account state (Prisma only, never
 * calls the engine): cash balance, positions and the latest 50 trades.
 */
export async function GET() {
  try {
    const [account, positions, trades] = await Promise.all([
      db.cashAccount.findUnique({ where: { id: MAIN_ACCOUNT_ID } }),
      db.position.findMany({ orderBy: { symbol: 'asc' } }),
      db.trade.findMany({
        orderBy: { createdAt: 'desc' },
        take: TRADES_LIMIT,
      }),
    ])

    return NextResponse.json({
      cash: round2(account?.balance ?? FALLBACK_CASH),
      initialCash: round2(account?.initialBalance ?? FALLBACK_CASH),
      positions: positions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        quantity: p.quantity,
        avgCost: round2(p.avgCost),
        realizedPnl: round2(p.realizedPnL),
        updatedAt: p.updatedAt.toISOString(),
      })),
      trades: trades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        price: round2(t.price),
        grossValue: round2(t.grossValue),
        fees: round2(t.fees),
        netValue: round2(t.netValue),
        createdAt: t.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('GET /api/portfolio failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
