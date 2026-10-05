import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAIN_ACCOUNT_ID = 'MAIN'
const INITIAL_CASH = 100000

/**
 * POST /api/portfolio/reset — reset the paper account: cash back to the
 * initial balance, delete all positions and trades.
 * 200 { ok: true }.
 */
export async function POST() {
  try {
    await db.$transaction([
      db.cashAccount.upsert({
        where: { id: MAIN_ACCOUNT_ID },
        update: { balance: INITIAL_CASH },
        create: { id: MAIN_ACCOUNT_ID, balance: INITIAL_CASH },
      }),
      db.position.deleteMany({}),
      db.trade.deleteMany({}),
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/portfolio/reset failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
