import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  EngineError,
  getEngine,
  type EngineQuote,
  type EngineSnapshot,
} from '@/lib/market-engine'
import { computeFees, round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAIN_ACCOUNT_ID = 'MAIN'
const INITIAL_CASH = 100000
const EPSILON = 1e-9

const tradeSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().finite().positive(),
})

type PositionRow = {
  id: string
  symbol: string
  quantity: number
  avgCost: number
  realizedPnL: number
  createdAt: Date
  updatedAt: Date
}

type TradeRow = {
  id: string
  symbol: string
  side: string
  quantity: number
  price: number
  grossValue: number
  fees: number
  netValue: number
  createdAt: Date
}

const mapPosition = (p: PositionRow) => ({
  id: p.id,
  symbol: p.symbol,
  quantity: p.quantity,
  avgCost: round2(p.avgCost),
  realizedPnl: round2(p.realizedPnL),
  updatedAt: p.updatedAt.toISOString(),
})

const mapTrade = (t: TradeRow) => ({
  id: t.id,
  symbol: t.symbol,
  side: t.side,
  quantity: t.quantity,
  price: round2(t.price),
  grossValue: round2(t.grossValue),
  fees: round2(t.fees),
  netValue: round2(t.netValue),
  createdAt: t.createdAt.toISOString(),
})

/**
 * POST /api/portfolio/trade { symbol, side: BUY|SELL, quantity>0 } —
 * execute a paper trade at the engine live price.
 * fees = max(commission 0.15% of gross, K5) + levy 0.05% of gross.
 * BUY: requires cash >= gross + fees; cash -= net; weighted-avg cost upsert.
 * SELL: requires position qty; cash += gross - fees; realizedPnL updated;
 *       position deleted at zero.
 * 200 { trade, cash, position|null } · 400 invalid/insufficient-cash/insufficient-shares
 * · 404 unknown symbol · 503 engine down.
 */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null)
  const parsed = tradeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }

  const symbol = parsed.data.symbol.toUpperCase()
  const { side, quantity } = parsed.data

  try {
    const stock = await db.stock.findUnique({
      where: { symbol },
      select: { symbol: true },
    })
    if (!stock) {
      return NextResponse.json({ error: 'symbol-not-found' }, { status: 404 })
    }

    // Single engine fetch for the live price.
    const snapshot = await getEngine<EngineSnapshot>('/api/stocks')
    const quote: EngineQuote | undefined = snapshot.stocks.find(
      (s) => s.symbol === symbol,
    )
    if (!quote || typeof quote.price !== 'number' || quote.price <= 0) {
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }

    const price = round2(quote.price)
    const gross = round2(price * quantity)
    const fees = computeFees(gross)

    const result = await db.$transaction(async (tx) => {
      const account = await tx.cashAccount.upsert({
        where: { id: MAIN_ACCOUNT_ID },
        update: {},
        create: { id: MAIN_ACCOUNT_ID, balance: INITIAL_CASH },
      })

      if (side === 'BUY') {
        const total = round2(gross + fees)
        if (account.balance < total - EPSILON) {
          return { error: 'insufficient-cash' as const }
        }

        const newBalance = round2(account.balance - total)
        await tx.cashAccount.update({
          where: { id: MAIN_ACCOUNT_ID },
          data: { balance: newBalance },
        })

        const existing = await tx.position.findUnique({ where: { symbol } })
        let position: PositionRow
        if (existing) {
          const newQty = existing.quantity + quantity
          const avgCost = round2(
            (existing.quantity * existing.avgCost + quantity * price) / newQty,
          )
          position = await tx.position.update({
            where: { symbol },
            data: { quantity: newQty, avgCost },
          })
        } else {
          position = await tx.position.create({
            data: { symbol, quantity, avgCost: price },
          })
        }

        const trade = await tx.trade.create({
          data: {
            symbol,
            side,
            quantity,
            price,
            grossValue: gross,
            fees,
            netValue: total,
          },
        })
        return { trade, cash: newBalance, position }
      }

      // side === 'SELL'
      const existing = await tx.position.findUnique({ where: { symbol } })
      if (!existing || existing.quantity < quantity - EPSILON) {
        return { error: 'insufficient-shares' as const }
      }

      const net = round2(gross - fees)
      const newBalance = round2(account.balance + net)
      await tx.cashAccount.update({
        where: { id: MAIN_ACCOUNT_ID },
        data: { balance: newBalance },
      })

      const realizedDelta = round2((price - existing.avgCost) * quantity - fees)
      const newQty = round2(existing.quantity - quantity)

      let position: PositionRow | null = null
      if (newQty <= EPSILON) {
        await tx.position.delete({ where: { symbol } })
      } else {
        position = await tx.position.update({
          where: { symbol },
          data: {
            quantity: newQty,
            realizedPnL: round2(existing.realizedPnL + realizedDelta),
          },
        })
      }

      const trade = await tx.trade.create({
        data: {
          symbol,
          side,
          quantity,
          price,
          grossValue: gross,
          fees,
          netValue: net,
        },
      })
      return { trade, cash: newBalance, position }
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      trade: mapTrade(result.trade),
      cash: round2(result.cash),
      position: result.position ? mapPosition(result.position) : null,
    })
  } catch (err) {
    if (err instanceof EngineError) {
      console.error('POST /api/portfolio/trade: engine unavailable:', err.message)
      return NextResponse.json({ error: 'engine-unavailable' }, { status: 503 })
    }
    console.error('POST /api/portfolio/trade failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
