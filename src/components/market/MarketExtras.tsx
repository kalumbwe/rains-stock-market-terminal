'use client';

/**
 * Market analysis extras rendered inside the Market tab:
 *  - SectorPerformance: equal-weight average day change per sector with
 *    animated bars (live quotes → no extra fetch).
 *  - DividendCalendar: next simulated ex-dividend dates built from seeded
 *    dividend yields (5-min cached /api/screener) + live prices.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import {
  buildDividendCalendar,
  fetchScreener,
  type DividendEvent,
  type ScreenerRow,
} from '@/lib/market/screener';

/* ------------------------------------------------------------------ */
/* Sector performance                                                  */
/* ------------------------------------------------------------------ */

export interface SectorStat {
  sector: string;
  avgPct: number;
  count: number;
  advancers: number;
  decliners: number;
}

export function useSectorStats(): SectorStat[] {
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const stocks = useMarketStore((s) => s.stocks);
  return useMemo(() => {
    const acc = new Map<string, { sum: number; n: number; adv: number; dec: number }>();
    for (const sym of stockOrder) {
      const q = stocks[sym];
      if (!q) continue;
      const cur = acc.get(q.sector) ?? { sum: 0, n: 0, adv: 0, dec: 0 };
      cur.sum += q.changePct;
      cur.n += 1;
      if (q.changePct > 0) cur.adv += 1;
      else if (q.changePct < 0) cur.dec += 1;
      acc.set(q.sector, cur);
    }
    return [...acc.entries()]
      .map(([sector, v]) => ({
        sector,
        avgPct: v.n > 0 ? v.sum / v.n : 0,
        count: v.n,
        advancers: v.adv,
        decliners: v.dec,
      }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [stockOrder, stocks]);
}

export function SectorPerformance() {
  const stats = useSectorStats();
  const maxAbs = useMemo(
    () => Math.max(0.35, ...stats.map((s) => Math.abs(s.avgPct))),
    [stats],
  );
  const setSelected = useMarketStore((s) => s.setSelected);

  if (stats.length === 0) {
    return (
      <section aria-label="Sector performance" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <PanelHeader icon={<Layers className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />} title="Sector Performance" />
        <div className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full bg-zinc-800/60" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Sector performance" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <PanelHeader
        icon={<Layers className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />}
        title="Sector Performance"
        right={<span className="font-mono text-[10px] text-zinc-600">equal-weight · day chg</span>}
      />
      <ul className="mt-2 space-y-1.5">
        {stats.map((s, i) => {
          const width = Math.max(3, (Math.abs(s.avgPct) / maxAbs) * 100);
          const up = s.avgPct >= 0;
          return (
            <motion.li
              key={s.sector}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
            >
              <button
                type="button"
                onClick={() => {
                  // Jump to the biggest counter of this sector for drill-in.
                  const order = useMarketStore.getState().stockOrder;
                  const stocks = useMarketStore.getState().stocks;
                  const pick = order.find((sym) => stocks[sym]?.sector === s.sector);
                  if (pick) setSelected(pick);
                }}
                className="group w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
                aria-label={`${s.sector}: average ${s.avgPct.toFixed(2)} percent, ${s.count} counters`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-zinc-300 group-hover:text-zinc-100">
                    {s.sector}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums">
                    <span className="text-zinc-600">{s.count}</span>
                    <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                      {up ? '+' : ''}{s.avgPct.toFixed(2)}%
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-950 ring-1 ring-zinc-800/80">
                  {/* Centre-anchored bar: growth right, decline left */}
                  <div className="flex w-1/2 justify-end">
                    {!up && (
                      <div
                        className="h-full rounded-l-full bg-gradient-to-l from-rose-500/80 to-rose-500/30"
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                  <div className="w-px bg-zinc-700" aria-hidden="true" />
                  <div className="flex w-1/2">
                    {up && (
                      <div
                        className="h-full rounded-r-full bg-gradient-to-r from-emerald-500/70 to-emerald-500/30"
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                </div>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dividend calendar                                                   */
/* ------------------------------------------------------------------ */

function exDateLabel(t: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(t));
}

export function DividendCalendar() {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const stocks = useMarketStore((s) => s.stocks);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await fetchScreener();
        if (alive) setRows(data.rows);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const events: DividendEvent[] = useMemo(() => {
    if (!rows) return [];
    return buildDividendCalendar(rows, (sym) => stocks[sym]?.price, 6);
  }, [rows, stocks]);

  if (failed) return null; // Degrade silently — engine/screener offline.

  return (
    <section aria-label="Dividend calendar" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <PanelHeader
        icon={<CalendarDays className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
        title="Dividend Calendar"
        right={<span className="font-mono text-[10px] text-zinc-600">sim · next 95d</span>}
      />
      {!rows ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full bg-zinc-800/60" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-zinc-600">No ex-dividend dates in range.</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-800/60">
          {events.map((e) => {
            const soon = e.daysAway <= 7;
            return (
              <li key={`${e.symbol}-${e.exDate}`} className="flex items-center gap-2 py-1.5">
                <div
                  className={`flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-md border font-mono tabular-nums ${
                    soon
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400'
                  }`}
                  aria-hidden="true"
                >
                  <span className="text-[9px] uppercase leading-none tracking-wider opacity-70">
                    {new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lusaka', month: 'short' }).format(new Date(e.exDate))}
                  </span>
                  <span className="text-xs font-bold leading-tight">
                    {new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lusaka', day: '2-digit' }).format(new Date(e.exDate))}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-bold tracking-wide text-zinc-200">{e.symbol}</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-400">
                      ≈ K{e.amountPerShare.toFixed(2)}/sh
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[10px] text-zinc-500">
                      {exDateLabel(e.exDate)} · {e.daysAway === 0 ? 'today' : `${e.daysAway}d`}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                      {e.yieldPct.toFixed(1)}% yld
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1.5 border-t border-zinc-800/60 pt-1.5 text-[9px] leading-relaxed text-zinc-600">
        Estimates only: quarterly payout ≈ live price × yield ÷ 4. Real LuSE timetables vary.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function PanelHeader({
  icon,
  title,
  right,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{title}</p>
      </div>
      {right}
    </div>
  );
}
