import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** GET /api/health — Next.js API liveness probe. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
