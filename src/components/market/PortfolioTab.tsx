'use client';

/**
 * Portfolio tab — cash, equity value (Σ qty × live price), total P&L vs
 * the K100,000 paper account, positions table with per-row Sell, trade
 * history and a confirmed account reset.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Loader2, PieChart as PieChartIcon, RotateCcw, Wallet, Download } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import {
  fmtDateTime,
  fmtK,
  fmtMoney,
  fmtPct,
  fmtSignedMoney,
} from '@/lib/market/format';
import type { PortfolioResponse } from '@/lib/market/types';

interface PortfolioTabProps {
  portfolio: PortfolioResponse | null;
  loading: boolean;
  onSell: (symbol: string) => void;
  onReset: () => Promise<boolean>;
}

/* ---------- Sector palette + analytics helpers ---------- */

const SECTOR_COLORS: Record<string, string> = {
  Banking: '#10b981',
  Mining: '#f97316',
  Energy: '#eab308',
  Telecommunications: '#a855f7',
  'Consumer Staples': '#84cc16',
  'Consumer Discretionary': '#f43f5e',
  Industrials: '#14b8a6',
  'Real Estate': '#d946ef',
};
const FALLBACK_COLORS = ['#f97316', '#10b981', '#eab308', '#f43f5e', '#14b8a6', '#a855f7'];
const CASH_COLOR = '#52525b';

function sectorColor(sector: string, idx: number): string {
  return SECTOR_COLORS[sector] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

interface AllocationSlice {
  name: string;
  value: number;
  color: string;
}

export function PortfolioTab({ portfolio, loading, onSell, onReset }: PortfolioTabProps) {
  const stocks = useMarketStore((s) => s.stocks);
  const [resetting, setResetting] = useState(false);

  const positions = portfolio?.positions ?? [];
  const cash = portfolio?.cash ?? null;
  const initialCash = portfolio?.initialCash ?? 100000;

  const equity = useMemo(
    () =>
      positions.reduce((sum, p) => {
        const live = stocks[p.symbol]?.price ?? p.avgCost;
        return sum + p.quantity * live;
      }, 0),
    [positions, stocks]
  );

  const totalValue = (cash ?? 0) + equity;
  const pnl = totalValue - initialCash;
  const pnlPct = initialCash > 0 ? (pnl / initialCash) * 100 : 0;
  const pnlColor = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-zinc-400';

  /** Download the whole paper account (summary + positions + trades) as CSV. */
  const exportCsv = () => {
    if (cash === null) return;
    const lines: string[] = [];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    lines.push('LuSE Pulse — Paper Portfolio Export');
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');
    lines.push('Summary');
    lines.push(`Cash,${cash.toFixed(2)}`);
    lines.push(`Equity,${equity.toFixed(2)}`);
    lines.push(`Total,${totalValue.toFixed(2)}`);
    lines.push(`P&L,${pnl.toFixed(2)}`);
    lines.push(`P&L %,${pnlPct.toFixed(2)}`);
    lines.push('');
    lines.push('Positions');
    lines.push('Symbol,Quantity,Avg Cost,Last,Unrealized P&L');
    for (const p of positions) {
      const live = stocks[p.symbol]?.price ?? p.avgCost;
      const upl = (live - p.avgCost) * p.quantity;
      lines.push(`${p.symbol},${p.quantity},${p.avgCost.toFixed(2)},${live.toFixed(2)},${upl.toFixed(2)}`);
    }
    lines.push('');
    lines.push('Trades');
    lines.push('Time,Side,Symbol,Quantity,Price,Gross Value,Fees');
    for (const t of portfolio?.trades ?? []) {
      lines.push(
        [t.createdAt, t.side, t.symbol, t.quantity, t.price.toFixed(2), t.grossValue.toFixed(2), t.fees.toFixed(2)]
          .map(esc)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `luse_portfolio_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ----- Analytics: sector allocation (incl. cash) + trading stats ----- */
  const allocation = useMemo<AllocationSlice[]>(() => {
    if (cash === null) return [];
    const bySector = new Map<string, number>();
    for (const p of positions) {
      const live = stocks[p.symbol]?.price ?? p.avgCost;
      const sector = stocks[p.symbol]?.sector ?? 'Other';
      bySector.set(sector, (bySector.get(sector) ?? 0) + p.quantity * live);
    }
    const slices: AllocationSlice[] = [...bySector.entries()].map(([sector, value], i) => ({
      name: sector,
      value,
      color: sectorColor(sector, i),
    }));
    slices.sort((a, b) => b.value - a.value);
    if (cash > 0) slices.push({ name: 'Cash', value: cash, color: CASH_COLOR });
    return slices;
  }, [positions, stocks, cash]);

  const tradeStats = useMemo(() => {
    const trades = portfolio?.trades ?? [];
    const buys = trades.filter((t) => t.side === 'BUY');
    const sells = trades.filter((t) => t.side === 'SELL');
    const fees = trades.reduce((a, t) => a + t.fees, 0);
    const turnover = buys.reduce((a, t) => a + t.grossValue, 0);
    const unrealized = positions.reduce((a, p) => {
      const live = stocks[p.symbol]?.price ?? p.avgCost;
      return a + (live - p.avgCost) * p.quantity;
    }, 0);
    return {
      count: trades.length,
      buys: buys.length,
      sells: sells.length,
      fees,
      avgBuy: buys.length > 0 ? turnover / buys.length : 0,
      unrealized,
    };
  }, [portfolio?.trades, positions, stocks]);

  const totalAlloc = allocation.reduce((a, s) => a + s.value, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <section
        aria-label="Portfolio summary"
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
      >
        <div className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Paper Portfolio
          </p>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-40 bg-zinc-800" />
            <Skeleton className="h-4 w-56 bg-zinc-800/70" />
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums text-zinc-50">
                  {cash !== null ? fmtMoney(totalValue) : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Equity {fmtMoney(equity)} · Cash {cash !== null ? fmtMoney(cash) : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-mono text-sm font-bold tabular-nums ${pnlColor}`}>
                  {fmtSignedMoney(pnl)}
                </p>
                <p className={`font-mono text-[11px] tabular-nums ${pnlColor}`}>
                  {fmtPct(pnlPct)} vs K100,000
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-zinc-800/70 pt-2.5">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || cash === null}
                  onClick={exportCsv}
                  className="h-8 flex-1 border-zinc-800 bg-zinc-950 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                  aria-label="Export portfolio as CSV"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export CSV
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resetting}
                    className="h-8 border-zinc-800 bg-zinc-950 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    aria-label="Reset paper account"
                  >
                    {resetting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Reset Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset paper account?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                      This restores your K100,000 virtual cash and deletes all positions
                      and trade history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setResetting(true);
                        void onReset().finally(() => setResetting(false));
                      }}
                      className="bg-orange-500 text-zinc-950 hover:bg-orange-400"
                    >
                      Reset account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <p className="text-center text-[10px] italic text-zinc-600">
                Paper trading — K100,000 virtual cash.
              </p>
            </div>
          </>
        )}
      </section>

      {/* Analytics — allocation donut + trading stats */}
      {!loading && cash !== null && (
        <section
          aria-label="Portfolio analytics"
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        >
          <div className="flex items-center gap-1.5">
            <PieChartIcon className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Allocation & Activity
            </p>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {allocation.length > 0 && totalAlloc > 0 ? (
              <>
                <div className="relative h-[120px] w-[120px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={56}
                        paddingAngle={2}
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {allocation.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#101013',
                          border: '1px solid #3f3f46',
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(value: number | string, name: string) => [
                          fmtMoney(Number(value)),
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[8px] uppercase tracking-widest text-zinc-500">Equity</span>
                    <span className="font-mono text-[11px] font-bold tabular-nums text-zinc-200">
                      {fmtMoney(equity)}
                    </span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1" aria-label="Allocation by sector">
                  {allocation.map((s) => (
                    <li key={s.name} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-zinc-400">{s.name}</span>
                      <span className="font-mono tabular-nums text-zinc-300">
                        {Math.round((s.value / totalAlloc) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-zinc-600">
                Allocation appears once you hold a position or cash.
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-800/70 pt-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Trades</p>
              <p className="font-mono text-xs font-bold tabular-nums text-zinc-200">
                {tradeStats.count}
                <span className="ml-1 font-normal text-zinc-500">
                  ({tradeStats.buys}B/{tradeStats.sells}S)
                </span>
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Fees Paid</p>
              <p className="font-mono text-xs font-bold tabular-nums text-amber-400/90">
                {fmtK(tradeStats.fees)}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">Unrealized P&L</p>
              <p
                className={`font-mono text-xs font-bold tabular-nums ${
                  tradeStats.unrealized > 0
                    ? 'text-emerald-400'
                    : tradeStats.unrealized < 0
                      ? 'text-rose-400'
                      : 'text-zinc-400'
                }`}
              >
                {fmtSignedMoney(tradeStats.unrealized)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Positions */}
      <section
        aria-label="Open positions"
        className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60"
      >
        <p className="border-b border-zinc-800 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Positions ({positions.length})
        </p>
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-zinc-800/60" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-zinc-600">
            No open positions — buy something from the terminal.
          </p>
        ) : (
          <ul className="luse-scroll max-h-72 space-y-1.5 overflow-y-auto p-2" aria-label="Position rows">
            {positions.map((p) => {
              const live = stocks[p.symbol]?.price ?? p.avgCost;
              const upl = (live - p.avgCost) * p.quantity;
              const uplPct = p.avgCost > 0 ? ((live - p.avgCost) / p.avgCost) * 100 : 0;
              const uplColor =
                upl > 0 ? 'text-emerald-400' : upl < 0 ? 'text-rose-400' : 'text-zinc-400';
              return (
                <li
                  key={p.id}
                  className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800/70 transition-colors hover:ring-zinc-700"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-100">{p.symbol}</span>
                    <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                      {p.quantity.toLocaleString()} shs
                    </span>
                    <span className={`ml-auto whitespace-nowrap font-mono text-xs font-semibold tabular-nums ${uplColor}`}>
                      {fmtSignedMoney(upl)}
                      <span className="ml-1 text-[10px] font-normal opacity-80">
                        ({fmtPct(uplPct)})
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSell(p.symbol)}
                      className="h-7 shrink-0 border-rose-500/40 bg-rose-500/10 px-2.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                      aria-label={`Sell ${p.symbol}`}
                    >
                      Sell
                    </Button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[10px] tabular-nums text-zinc-500">
                    <span>avg {fmtK(p.avgCost)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="text-zinc-300">last {fmtK(live)}</span>
                    <span className="ml-auto">{stocks[p.symbol]?.sector}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Trade history */}
      <section
        aria-label="Trade history"
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
      >
        <div className="mb-2 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Trade History
          </p>
        </div>
        {(portfolio?.trades ?? []).length === 0 ? (
          <p className="py-3 text-center text-xs text-zinc-600">No trades yet.</p>
        ) : (
          <ul className="luse-scroll max-h-64 space-y-1 overflow-y-auto pr-1">
            {(portfolio?.trades ?? []).map((t, i) => (
              <motion.li
                key={t.id}
                initial={i === 0 ? { opacity: 0, y: -6 } : false}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800/70"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`h-5 shrink-0 border text-[9px] font-bold tracking-wider ${
                      t.side === 'BUY'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {t.side}
                  </Badge>
                  <span className="font-mono text-xs tabular-nums text-zinc-200">
                    {t.quantity.toLocaleString()} {t.symbol}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">
                    @ {fmtK(t.price)}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                  {fmtDateTime(t.createdAt)}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
