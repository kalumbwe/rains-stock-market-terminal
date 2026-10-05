/**
 * LuSE Pulse — pure technical indicators (no side effects).
 */

/** Simple Moving Average of the last `n` closes. Returns null if insufficient data. */
export function sma(closes: number[], n: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || closes.length < n) return null;
  const slice = closes.slice(-n);
  let sum = 0;
  for (const v of slice) {
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum / n;
}

/**
 * Relative Strength Index (Wilder's smoothing).
 * Returns null if insufficient data (needs period + 1 closes).
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MarketSignal = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/**
 * Composite signal from SMA20/SMA50 cross + RSI(14) extremes.
 * - SMA20 > SMA50 and RSI < 70 → BULLISH
 * - SMA20 < SMA50 and RSI > 30 → BEARISH
 * - otherwise NEUTRAL
 */
export function signalFrom(
  sma20: number | null,
  sma50: number | null,
  rsi14: number | null
): MarketSignal {
  if (sma20 === null || sma50 === null || rsi14 === null) return 'NEUTRAL';
  if (sma20 > sma50 && rsi14 < 70) return 'BULLISH';
  if (sma20 < sma50 && rsi14 > 30) return 'BEARISH';
  return 'NEUTRAL';
}

/** Rolling SMA series aligned to the input length (null during warm-up). */
export function smaSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/**
 * Annualised volatility (%) from daily closes via log-return std-dev × √252.
 * Needs at least 5 closes to be meaningful.
 */
export function annualizedVolatility(closes: number[]): number | null {
  if (closes.length < 5) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0) return null;
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Maximum peak-to-trough drawdown (%) over the close series. */
export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = ((peak - c) / peak) * 100;
      if (dd > mdd) mdd = dd;
    }
  }
  return mdd;
}

export type NewsSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type NewsImpact = 'HIGH' | 'MEDIUM' | 'LOW';

const IMPACT_WEIGHT: Record<NewsImpact, number> = { HIGH: 1.5, MEDIUM: 1, LOW: 0.5 };

export interface SentimentScore {
  /** Normalised -100 (max bearish) … +100 (max bullish). */
  score: number;
  label: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  positive: number;
  negative: number;
  neutral: number;
}

/**
 * Impact-weighted news sentiment over the given items (latest N handled by
 * the caller). Score = Σ(±weight) / Σ(weight) × 100.
 */
export function newsSentiment(
  items: { sentiment: string; impact: string }[],
): SentimentScore {
  let pos = 0;
  let neg = 0;
  let neu = 0;
  let num = 0;
  let den = 0;
  for (const it of items) {
    const w = IMPACT_WEIGHT[(it.impact as NewsImpact) in IMPACT_WEIGHT ? (it.impact as NewsImpact) : 'MEDIUM'];
    den += w;
    if (it.sentiment === 'POSITIVE') {
      pos++;
      num += w;
    } else if (it.sentiment === 'NEGATIVE') {
      neg++;
      num -= w;
    } else {
      neu++;
    }
  }
  const score = den > 0 ? Math.round((num / den) * 100) : 0;
  const label: SentimentScore['label'] =
    score >= 20 ? 'BULLISH' : score <= -20 ? 'BEARISH' : 'NEUTRAL';
  return { score, label, positive: pos, negative: neg, neutral: neu };
}
