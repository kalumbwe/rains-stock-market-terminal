import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const watchlistPostSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
})

const mapItem = (item: { id: string; symbol: string; createdAt: Date }) => ({
  id: item.id,
  symbol: item.symbol,
  createdAt: item.createdAt.toISOString(),
})

/** GET /api/watchlist — list watchlist items (Prisma only). */
export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ items: items.map(mapItem) })
  } catch (err) {
    console.error('GET /api/watchlist failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}

/**
 * POST /api/watchlist { symbol } — add a stock to the watchlist.
 * 201 { item } · 400 invalid body · 404 unknown symbol · 409 duplicate.
 */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const parsed = watchlistPostSchema.safeParse(body)
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

    const existing = await db.watchlistItem.findUnique({ where: { symbol } })
    if (existing) {
      return NextResponse.json({ error: 'duplicate' }, { status: 409 })
    }

    const item = await db.watchlistItem.create({ data: { symbol } })
    return NextResponse.json({ item: mapItem(item) }, { status: 201 })
  } catch (err) {
    // Race on unique constraint → treat as duplicate.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'duplicate' }, { status: 409 })
    }
    console.error('POST /api/watchlist failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
