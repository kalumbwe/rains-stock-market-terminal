// Zambia LuSE Market Terminal — pure server-side helpers (no I/O, testable).
import type { EngineCandle } from '@/lib/market-engine'

/**
 * Round a number to 2 decimal places (Kwacha prices/amounts).
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ */
/* Fees — constants mirror shared/luse-stocks.json → meta.fees         */
/* { "commissionPct": 0.15, "minCommissionZMW": 5, "levyPct": 0.05 }   */
/* ------------------------------------------------------------------ */

/** Broker commission as a fraction of gross value (0.15%). */
export const COMMISSION_PCT = 0.15 / 100
/** Minimum broker commission in ZMW (K5). */
export const MIN_COMMISSION_ZMW = 5
/** Regulatory levy as a fraction of gross value (0.05%). */
export const LEVY_PCT = 0.05 / 100

/**
 * Total transaction fees for a trade with the given gross value:
 * commission = max(0.15% of gross, K5) + levy = 0.05% of gross.
 * Returned rounded to 2dp.
 */
export function computeFees(gross: number): number {
  const g = Number.isFinite(gross) && gross > 0 ? gross : 0
  const commission = Math.max(g * COMMISSION_PCT, MIN_COMMISSION_ZMW)
  const levy = g * LEVY_PCT
  return round2(commission + levy)
}

/* ------------------------------------------------------------------ */
/* Candle aggregation                                                  */
/* ------------------------------------------------------------------ */

const roundCandle = (c: EngineCandle): EngineCandle => ({
  t: c.t,
  o: round2(c.o),
  h: round2(c.h),
  l: round2(c.l),
  c: round2(c.c),
  v: Math.round(c.v),
})

/**
 * Aggregate 1m candles into N-minute buckets (pure function).
 * Buckets are aligned to epoch time (floor of t / bucketMs), merged
 * open/high/low/close/volume, returned ascending by time.
 */
export function aggregateCandles(
  candles: EngineCandle[],
  minutes: number,
): EngineCandle[] {
  if (!Array.isArray(candles) || !Number.isFinite(minutes) || minutes <= 0) {
    return []
  }

  const bucketMs = minutes * 60_000
  const buckets = new Map<number, EngineCandle>()

  for (const raw of candles) {
    if (
      !raw ||
      typeof raw.t !== 'number' ||
      typeof raw.o !== 'number' ||
      typeof raw.h !== 'number' ||
      typeof raw.l !== 'number' ||
      typeof raw.c !== 'number'
    ) {
      continue
    }
    const t = Math.floor(raw.t / bucketMs) * bucketMs
    const existing = buckets.get(t)

    if (!existing) {
      buckets.set(t, { t, o: raw.o, h: raw.h, l: raw.l, c: raw.c, v: raw.v })
    } else {
      existing.h = Math.max(existing.h, raw.h)
      existing.l = Math.min(existing.l, raw.l)
      existing.c = raw.c // last close in the bucket wins
      existing.v += typeof raw.v === 'number' ? raw.v : 0
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.t - b.t)
    .map(roundCandle)
}
