'use client';

/**
 * Correlation matrix — Pearson correlation of daily closes (last ~66 trading
 * days) across all listed counters. Data: 17 parallel candle fetches,
 * computed once and cached in module state while mounted.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Grid3x3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Candle } from '@/lib/market/types';

const WINDOW = 66; // trading days

type Matrix = {
  symbols: string[];
  /** matrix[i][j] = r(symbols[i], symbols[j]) */
  r: number[][];
};

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : Math.max(-1, Math.min(1, num / den));
}

function cellColor(r: number): string {
  const a = Math.min(0.85, Math.abs(r) * 0.85 + 0.04);
  if (r >= 0) return `rgba(16, 185, 129, ${a})`;
  return `rgba(244, 63, 94, ${a})`;
}

export function CorrelationMatrix({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const listRes = await fetch('/api/stocks', { cache: 'no-store' });
      if (!listRes.ok) throw new Error('stocks');
      const snap = (await listRes.json()) as { stocks: { symbol: string }[] };
      const symbols = snap.stocks.map((s) => s.symbol);

      const candleLists = await Promise.all(
        symbols.map(async (sym) => {
          const res = await fetch(
            `/api/stocks/${encodeURIComponent(sym)}/candles?interval=1d&limit=${WINDOW}`,
            { cache: 'no-store' },
          );
          if (!res.ok) throw new Error(`candles ${sym}`);
          const data = (await res.json()) as { candles: Candle[] };
          return data.candles.map((c) => c.c);
        }),
      );

      const n = symbols.length;
      const r: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        r[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
          const v = pearson(candleLists[i], candleLists[j]);
          r[i][j] = v;
          r[j][i] = v;
        }
      }
      setMatrix({ symbols, r });
    } catch {
      setError(true);
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!matrix && !loading) void load();
  }, [load]);

  const strongest = useMemo(() => {
    if (!matrix) return null;
    let best = { i: 0, j: 1, v: -2 };
    for (let i = 0; i < matrix.symbols.length; i++) {
      for (let j = i + 1; j < matrix.symbols.length; j++) {
        if (matrix.r[i][j] > best.v) best = { i, j, v: matrix.r[i][j] };
      }
    }
    return best.v > -2 ? { pair: `${matrix.symbols[best.i]} ↔ ${matrix.symbols[best.j]}`, v: best.v } : null;
  }, [matrix]);

  if (loading && !matrix) {
    return (
      <div className="space-y-2 p-5">
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Correlating {WINDOW}-day closes across all counters…
        </p>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full bg-zinc-800/60" />
        ))}
      </div>
    );
  }

  if (error || !matrix) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-zinc-500">
        <Grid3x3 className="h-6 w-6" aria-hidden="true" />
        <p className="text-sm">Correlation data unavailable right now.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
        >
          <Loader2 className="h-3 w-3" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          <Grid3x3 className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          Pearson r · daily closes · {WINDOW}d
        </p>
        {strongest ? (
          <p className="font-mono text-[10px] tabular-nums text-zinc-500">
            tightest pair:{' '}
            <span className="font-semibold text-emerald-400">{strongest.pair}</span>{' '}
            r={strongest.v.toFixed(2)}
          </p>
        ) : null}
      </div>
      <div className="luse-scroll overflow-auto">
        <table className="border-collapse text-[10px]" aria-label="Correlation matrix">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-zinc-950 px-1.5 py-1 text-left font-semibold text-zinc-500">
                r
              </th>
              {matrix.symbols.map((s) => (
                <th key={s} scope="col" className="px-0.5 py-1 font-mono font-semibold text-zinc-500">
                  <span className="block max-w-11 truncate" title={s}>
                    {s}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.symbols.map((rowSym, i) => (
              <tr key={rowSym}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-zinc-950 px-1.5 py-0.5 text-left font-mono font-semibold text-zinc-400"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(rowSym)}
                    className="rounded px-0.5 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
                    aria-label={`Open ${rowSym} in terminal`}
                    title={`Open ${rowSym} in terminal`}
                  >
                    {rowSym}
                  </button>
                </th>
                {matrix.symbols.map((colSym, j) => {
                  const v = matrix.r[i][j];
                  const diag = i === j;
                  return (
                    <td key={colSym} className="p-0">
                      <div
                        title={`${rowSym} ↔ ${colSym}: r = ${v.toFixed(2)}`}
                        aria-label={`${rowSym} to ${colSym} correlation ${v.toFixed(2)}`}
                        className="flex h-7 min-w-11 items-center justify-center border border-zinc-900 font-mono tabular-nums text-zinc-100"
                        style={{
                          backgroundColor: diag ? 'rgba(113,113,122,0.25)' : cellColor(v),
                          color: Math.abs(v) > 0.55 ? '#fafafa' : '#a1a1aa',
                        }}
                      >
                        {diag ? '—' : v.toFixed(2).replace('0.', '.')}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-zinc-600">
        Green = move together, rose = move apart. Click a row header to open that counter in the
        terminal. Computed from seeded daily history — illustrative of co-movement, not a trading signal.
      </p>
    </div>
  );
}
