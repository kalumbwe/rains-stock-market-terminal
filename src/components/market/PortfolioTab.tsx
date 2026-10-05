'use client';

/**
 * Portfolio tab — cash, equity value (Σ qty × live price), total P&L vs
 * the K100,000 paper account, positions table with per-row Sell, trade
 * history and a confirmed account reset.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Loader2, RotateCcw, Wallet } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[10px] italic text-zinc-600">
                Paper trading — K100,000 virtual cash.
              </p>
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
          </>
        )}
      </section>

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
          <div className="luse-scroll max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="h-8 text-[10px] uppercase tracking-wider text-zinc-500">Symbol</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-zinc-500">Qty</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-zinc-500">Avg Cost</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-zinc-500">Last</TableHead>
                  <TableHead className="h-8 text-right text-[10px] uppercase tracking-wider text-zinc-500">P&L</TableHead>
                  <TableHead className="h-8 w-14 text-right text-[10px] uppercase tracking-wider text-zinc-500">
                    <span className="sr-only">Sell</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p) => {
                  const live = stocks[p.symbol]?.price ?? p.avgCost;
                  const upl = (live - p.avgCost) * p.quantity;
                  const uplColor =
                    upl > 0 ? 'text-emerald-400' : upl < 0 ? 'text-rose-400' : 'text-zinc-400';
                  return (
                    <TableRow key={p.id} className="border-zinc-800/70">
                      <TableCell className="py-2 font-mono text-xs font-bold text-zinc-100">
                        {p.symbol}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-zinc-300">
                        {p.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-zinc-400">
                        {fmtK(p.avgCost)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-zinc-100">
                        {fmtK(live)}
                      </TableCell>
                      <TableCell className={`py-2 whitespace-nowrap text-right font-mono text-xs font-semibold tabular-nums ${uplColor}`}>
                        {fmtSignedMoney(upl)}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onSell(p.symbol)}
                          className="h-7 border-rose-500/40 bg-rose-500/10 px-2 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                          aria-label={`Sell ${p.symbol}`}
                        >
                          Sell
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
