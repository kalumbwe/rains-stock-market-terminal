import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const watchlistPostSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
})

/** PATCH body — full ordered symbol list for manual drag-to-reorder. */
const watchlistPatchSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(20)).min(1).max(100),
})

const mapItem = (item: { id: string; symbol: string; order: number; createdAt: Date }) => ({
  id: item.id,
  symbol: item.symbol,
  order: item.order,
  createdAt: item.createdAt.toISOString(),
})

/** GET /api/watchlist — list watchlist items ordered by manual order, then createdAt. */
export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
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

    // Append to the end of the manual order.
    const maxAgg = await db.watchlistItem.aggregate({ _max: { order: true } })
    const nextOrder = (maxAgg._max.order ?? -1) + 1

    const item = await db.watchlistItem.create({
      data: { symbol, order: nextOrder },
    })
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

/**
 * PATCH /api/watchlist { symbols: string[] } — persist a manual watchlist
 * order (drag-to-reorder). Symbols not in the payload keep their order;
 * unknown symbols are ignored. 200 { items } · 400 invalid body.
 */
export async function PATCH(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const parsed = watchlistPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
    }

    const symbols = parsed.data.symbols.map((s) => s.toUpperCase())

    // Apply each index as its new order. Sequential updates avoid unique /
    // constraint surprises; order values may repeat, which is fine — GET
    // breaks ties by createdAt.
    await db.$transaction(
      symbols.map((symbol, idx) =>
        db.watchlistItem.updateMany({
          where: { symbol },
          data: { order: idx },
        })
      )
    )

    const items = await db.watchlistItem.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ items: items.map(mapItem) })
  } catch (err) {
    console.error('PATCH /api/watchlist failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
