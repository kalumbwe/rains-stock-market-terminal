import { NextResponse } from 'next/server'
import { z } from 'zod'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const alertPostSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  condition: z.enum(['ABOVE', 'BELOW']),
  targetPrice: z.number().finite().positive(),
})

const mapAlert = (a: {
  id: string
  symbol: string
  condition: string
  targetPrice: number
  active: boolean
  triggeredAt: Date | null
  createdAt: Date
}) => ({
  id: a.id,
  symbol: a.symbol,
  condition: a.condition,
  targetPrice: round2(a.targetPrice),
  active: a.active,
  triggeredAt: a.triggeredAt ? a.triggeredAt.toISOString() : null,
  createdAt: a.createdAt.toISOString(),
})

/** GET /api/alerts — list price alerts (Prisma only). */
export async function GET() {
  try {
    const alerts = await db.alert.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ alerts: alerts.map(mapAlert) })
  } catch (err) {
    console.error('GET /api/alerts failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}

/**
 * POST /api/alerts { symbol, condition: ABOVE|BELOW, targetPrice>0 } —
 * create a price alert. 201 { alert } · 400 invalid · 404 unknown symbol.
 */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const parsed = alertPostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
    }

    const symbol = parsed.data.symbol.toUpperCase()

    const stock = await db.stock.findUnique({
      where: { symbol },
      select: { symbol: true },
    })
    if (!stock) {
      return NextResponse.json({ error: 'symbol-not-found' }, { status: 404 })
    }

    const alert = await db.alert.create({
      data: {
        symbol,
        condition: parsed.data.condition,
        targetPrice: round2(parsed.data.targetPrice),
        active: true,
      },
    })
    return NextResponse.json({ alert: mapAlert(alert) }, { status: 201 })
  } catch (err) {
    console.error('POST /api/alerts failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
