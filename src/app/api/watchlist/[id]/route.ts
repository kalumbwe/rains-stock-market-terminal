import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/watchlist/[id] — remove a watchlist item.
 * 200 { ok: true } · 404 if missing.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'invalid-id' }, { status: 400 })
    }

    const existing = await db.watchlistItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 })
    }

    await db.watchlistItem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/watchlist/[id] failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
