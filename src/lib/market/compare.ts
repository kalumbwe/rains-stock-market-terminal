/**
 * Stock Compare — helpers to fetch daily closes for several symbols and
 * compute normalized (base-100) performance series + per-symbol risk stats.
 * Used by CompareDialog. All pure math lives here for testability.
 */

export interface DailyCloses {
  symbol: string;
  /** [{ t: epoch ms, c: close }] ascending, trimmed to the requested length. */
  points: { t: number; c: number }[];
}

export interface SymbolStats {
  /** Total period return, %. */
  returnPct: number;
  /** Annualised volatility of daily returns, %. */
  annVolPct: number;
  /** Max drawdown over the window, % (negative number). */
  maxDrawdownPct: number;
  /** Best single-day move, %. */
  bestDayPct: number;
  /** Worst single-day move, %. */
  worstDayPct: number;
}

export const COMPARE_COLORS = [
  '#f97316', // orange-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#eab308', // yellow-500
] as const;

/** Fetch daily closes (ascending) for a symbol. Throws on non-2xx. */
export async function fetchDailyCloses(symbol: string, limit: number): Promise<DailyCloses> {
  const res = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/candles?interval=1d&limit=${limit}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`candles ${symbol} → ${res.status}`);
  const json = (await res.json()) as { candles: { t: number; c: number }[] };
  return { symbol, points: json.candles.map((k) => ({ t: k.t, c: k.c })) };
}

/** Normalize a close series so the first value equals 100 (base-100 index). */
export function normalizeTo100(closes: number[]): number[] {
  if (closes.length === 0) return [];
  const base = closes[0];
  if (base === 0) return closes.map(() => 0);
  return closes.map((c) => (c / base) * 100);
}

/**
 * Trim a series to the last `n` points and align all series on their common
 * overlap (same dates) so lines start on the same trading day.
 */
export function alignSeries(series: DailyCloses[]): DailyCloses[] {
  if (series.length === 0) return series;
  let minLen = Math.min(...series.map((s) => s.points.length));
  // Align from the end (most recent) so partial early histories still line up.
  return series.map((s) => ({ ...s, points: s.points.slice(-minLen) }));
}

/** Per-symbol risk/return stats from daily closes. */
export function computeStats(closes: number[]): SymbolStats {
  const n = closes.length;
  if (n < 2) {
    return { returnPct: 0, annVolPct: 0, maxDrawdownPct: 0, bestDayPct: 0, worstDayPct: 0 };
  }
  const first = closes[0];
  const last = closes[n - 1];
  const returnPct = ((last - first) / first) * 100;

  // Daily returns
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  const annVolPct = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // Max drawdown on closes
  let peak = closes[0];
  let maxDD = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const best = Math.max(...rets);
  const worst = Math.min(...rets);

  return {
    returnPct,
    annVolPct,
    maxDrawdownPct: maxDD * 100,
    bestDayPct: best * 100,
    worstDayPct: worst * 100,
  };
}

/** Rebase-aligned chart row: { t, [symbol]: value }. */
export function buildChartRows(series: DailyCloses[]): { t: number; [sym: string]: number }[] {
  if (series.length === 0) return [];
  const rows: { t: number; [sym: string]: number }[] = [];
  for (let i = 0; i < series[0].points.length; i++) {
    const row: { t: number; [sym: string]: number } = { t: series[0].points[i].t };
    for (const s of series) {
      row[s.symbol] = (s.points[i].c / s.points[0].c) * 100;
    }
    rows.push(row);
  }
  return rows;
}
