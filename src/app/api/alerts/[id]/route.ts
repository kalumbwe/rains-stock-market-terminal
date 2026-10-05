import { NextResponse } from 'next/server'
import { z } from 'zod'
import { round2 } from '@/lib/server-utils'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Either { trigger: true } → mark triggered now, or { active: boolean }.
const alertPatchSchema = z.union([
  z.object({ trigger: z.literal(true) }),
  z.object({ active: z.boolean() }),
])

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

/**
 * DELETE /api/alerts/[id] — remove an alert.
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

    const existing = await db.alert.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 })
    }

    await db.alert.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/alerts/[id] failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}

/**
 * PATCH /api/alerts/[id] — body { trigger: true } sets triggeredAt=now and
 * active=false; body { active: boolean } toggles the alert.
 * 200 { alert } · 400 invalid body · 404 if missing.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'invalid-id' }, { status: 400 })
    }

    const body: unknown = await req.json().catch(() => null)
    const parsed = alertPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-body', allowed: ['{ trigger: true }', '{ active: boolean }'] },
        { status: 400 },
      )
    }

    const existing = await db.alert.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 })
    }

    const data = 'trigger' in parsed.data
      ? { triggeredAt: new Date(), active: false }
      : { active: parsed.data.active }

    const alert = await db.alert.update({ where: { id }, data })
    return NextResponse.json({ alert: mapAlert(alert) })
  } catch (err) {
    console.error('PATCH /api/alerts/[id] failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
