import { NextResponse } from 'next/server'
import type { NewsItem as DbNewsItem } from '@prisma/client'
import { EngineError, getEngine, type EngineNewsItem, type EngineNewsResponse } from '@/lib/market-engine'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100
const DB_NEWS_TAKE = 15
const ENGINE_NEWS_LIMIT = 25

function mapDbNews(row: DbNewsItem): EngineNewsItem {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    source: row.source,
    symbols: row.symbols
      ? row.symbols
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    sentiment: (row.sentiment as EngineNewsItem['sentiment']) ?? 'NEUTRAL',
    impact: (row.impact as EngineNewsItem['impact']) ?? 'MEDIUM',
    publishedAt: row.publishedAt.toISOString(),
  }
}

/**
 * GET /api/news?limit=30 — merge seeded Prisma NewsItem (latest 15) with
 * live engine news (latest 25), sorted desc by publishedAt, deduped by
 * headline, capped at `limit`.
 * Graceful degradation: if the engine is down, seeded news alone is returned.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    let limit = DEFAULT_LIMIT
    const limitRaw = url.searchParams.get('limit')
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ error: 'invalid-limit' }, { status: 400 })
      }
      limit = Math.min(parsed, MAX_LIMIT)
    }

    const [dbRows, engineNews] = await Promise.all([
      db.newsItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: DB_NEWS_TAKE,
      }),
      getEngine<EngineNewsResponse>('/api/news?limit=25')
        .then((res) => (Array.isArray(res.news) ? res.news : []))
        .catch((err: unknown) => {
          if (err instanceof EngineError) {
            console.warn('GET /api/news: engine unavailable, serving seeded news only')
            return []
          }
          throw err
        }),
    ])

    const merged: EngineNewsItem[] = [
      ...dbRows.map(mapDbNews),
      ...engineNews,
    ]

    merged.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )

    // Dedupe by headline (most recent occurrence wins), cap at limit.
    const seen = new Set<string>()
    const news: EngineNewsItem[] = []
    for (const item of merged) {
      const key = item.headline.trim()
      if (seen.has(key)) continue
      seen.add(key)
      news.push(item)
      if (news.length >= limit) break
    }

    return NextResponse.json({ news })
  } catch (err) {
    console.error('GET /api/news failed:', err)
    return NextResponse.json({ error: 'internal-error' }, { status: 500 })
  }
}
