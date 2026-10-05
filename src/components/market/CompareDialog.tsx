'use client';

/**
 * Compare dialog — pick up to 4 LuSE counters and see their normalized
 * (base-100) daily performance side by side over 1M / 3M / 1Y, with a
 * risk/return stats table (return, ann. volatility, max drawdown,
 * best/worst day). Benchmark line: the first selected symbol acts as the
 * base; dates are aligned on the common overlap.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitCompareArrows,
  Inbox,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import {
  alignSeries,
  buildChartRows,
  COMPARE_COLORS,
  computeStats,
  fetchDailyCloses,
  type DailyCloses,
  type SymbolStats,
} from '@/lib/market/compare';
import { fmtPct } from '@/lib/market/format';

const RANGES = [
  { key: '1M' as const, limit: 22 },
  { key: '3M' as const, limit: 66 },
  { key: '1Y' as const, limit: 252 },
];

const MAX_PICKS = 4;

function statColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

export function CompareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const stocks = useMarketStore((s) => s.stocks);
  const setSelected = useMarketStore((s) => s.setSelected);
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);

  const [picks, setPicks] = useState<string[]>(['ZANACO', 'ZSUG']);
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('3M');
  const [series, setSeries] = useState<DailyCloses[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const limit = RANGES.find((r) => r.key === range)?.limit ?? 66;

  const load = useCallback(async (symbols: string[], lim: number) => {
    if (symbols.length === 0) {
      setSeries([]);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const results = await Promise.all(symbols.map((s) => fetchDailyCloses(s, lim)));
      setSeries(alignSeries(results));
    } catch {
      setError(true);
      setSeries(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load(picks, limit);
    // Reload when the dialog opens or the range changes.
  }, [open, range]);

  const togglePick = (symbol: string) => {
    setPicks((prev) => {
      if (prev.includes(symbol)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((p) => p !== symbol);
      }
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, symbol];
    });
  };

  // Refetch when picks change (only while dialog open).
  useEffect(() => {
    if (open) void load(picks, limit);
  }, [picks]);

  const chartRows = useMemo(() => (series ? buildChartRows(series) : []), [series]);

  const statsBySymbol = useMemo(() => {
    const map = new Map<string, SymbolStats>();
    if (series) {
      for (const s of series) {
        map.set(s.symbol, computeStats(s.points.map((p) => p.c)));
      }
    }
    return map;
  }, [series]);

  // Symbols referenced by live quotes for last-price overlay in the legend.
  const lastChange = useCallback(
    (symbol: string) => stocks[symbol]?.changePct ?? null,
    [stocks]
  );

  const dateFmt = (t: number) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(t));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 border-zinc-800 bg-zinc-950 p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
            <GitCompareArrows className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Compare Counters
            <span className="ml-1 rounded bg-zinc-800 px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {picks.length}/{MAX_PICKS}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Normalized performance comparison of up to four LuSE counters with risk statistics
          </DialogDescription>
        </DialogHeader>

        {/* Range + picker row */}
        <div className="shrink-0 space-y-2.5 border-b border-zinc-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-zinc-800" role="group" aria-label="Comparison range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  aria-pressed={range === r.key}
                  className={`h-8 px-3 font-mono text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                    range === r.key
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-zinc-900/60 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {r.key}
                </button>
              ))}
            </div>

            {/* Selected chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {picks.map((sym, i) => (
                <span
                  key={sym}
                  className="group flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 pl-2 pr-1"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-xs font-bold text-zinc-100">{sym}</span>
                  <button
                    type="button"
                    onClick={() => togglePick(sym)}
                    disabled={picks.length === 1}
                    aria-label={`Remove ${sym} from comparison`}
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {picks.length < MAX_PICKS && (
                <span className="flex h-8 items-center gap-1 rounded-md border border-dashed border-zinc-800 px-2 text-[10px] text-zinc-600">
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  add below
                </span>
              )}
            </div>
          </div>

          {/* Symbol picker */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Add counters to compare">
            {stockOrder.map((sym) => {
              const active = picks.includes(sym);
              const disabled = !active && picks.length >= MAX_PICKS;
              const live = stocks[sym];
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => togglePick(sym)}
                  disabled={disabled}
                  aria-pressed={active}
                  title={live?.name ?? sym}
                  className={`h-7 rounded-md border px-2 font-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                    active
                      ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                      : disabled
                        ? 'cursor-not-allowed border-zinc-800/60 bg-zinc-900/40 text-zinc-700'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div className="min-h-0 flex-1 px-5 pt-4">
          {loading && !series ? (
            <Skeleton className="shimmer h-full min-h-[220px] w-full bg-zinc-900" />
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
              <Inbox className="h-6 w-6" aria-hidden="true" />
              <p className="text-sm">History unavailable — try again.</p>
              <button
                type="button"
                onClick={() => void load(picks, limit)}
                className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-zinc-800"
              >
                <Loader2 className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <LineChart data={chartRows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={dateFmt}
                  stroke="#52525b"
                  tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                  minTickGap={42}
                />
                <YAxis
                  stroke="#52525b"
                  tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => v.toFixed(0)}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#101013',
                    border: '1px solid #3f3f46',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: '#a1a1aa', fontFamily: 'var(--font-geist-mono), monospace' }}
                  formatter={(value: number | string, name: string) => [
                    `${Number(value).toFixed(2)} (${((Number(value) - 100)).toFixed(2)}%)`,
                    name,
                  ]}
                  cursor={{ stroke: '#f97316', strokeOpacity: 0.3 }}
                />
                {picks.map((sym, i) => (
                  <Line
                    key={sym}
                    type="monotone"
                    dataKey={sym}
                    stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats table */}
        <div className="shrink-0 border-t border-zinc-800 px-5 py-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" aria-label="Comparison statistics">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Counter</th>
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">Return</th>
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">Ann. Vol</th>
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">Max DD</th>
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">Best Day</th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-semibold">Worst Day</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((sym, i) => {
                  const st = statsBySymbol.get(sym);
                  const chg = lastChange(sym);
                  return (
                    <tr
                      key={sym}
                      className="cursor-pointer border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/60"
                      onClick={() => {
                        setSelected(sym);
                        onOpenChange(false);
                      }}
                      aria-label={`Open ${sym} in terminal`}
                    >
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span className="font-mono font-bold text-zinc-100">{sym}</span>
                          {sym === selectedSymbol && (
                            <span className="rounded bg-orange-500/15 px-1 text-[9px] font-bold uppercase tracking-wider text-orange-400">
                              viewed
                            </span>
                          )}
                          {chg !== null && (
                            <span className={`font-mono text-[10px] tabular-nums ${statColor(chg)}`}>
                              {fmtPct(chg)} today
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${st ? statColor(st.returnPct) : ''}`}>
                        {st ? fmtPct(st.returnPct) : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                        {st ? `${st.annVolPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-rose-400/90">
                        {st ? `${st.maxDrawdownPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${st ? statColor(st.bestDayPct) : ''}`}>
                        {st ? fmtPct(st.bestDayPct) : '—'}
                      </td>
                      <td className={`py-1.5 pl-2 text-right font-mono tabular-nums ${st ? statColor(st.worstDayPct) : ''}`}>
                        {st ? fmtPct(st.worstDayPct) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">
            Base-100 rebased closes over {range} · click a row to open the counter in the terminal
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
