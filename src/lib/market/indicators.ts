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
