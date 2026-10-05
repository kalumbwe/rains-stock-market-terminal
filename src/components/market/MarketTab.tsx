'use client';

/**
 * Market tab — LASI intraday sparkline, market breadth bars, sector-style
 * heatmap (tile size ∝ market cap, color intensity ∝ |change|) and
 * Gainers / Losers / Most Active movers.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Flame, Newspaper, TrendingDown, TrendingUp } from 'lucide-react';
import { useMarketStore } from '@/lib/market/store';
import { newsSentiment } from '@/lib/market/indicators';
import { fmtBig, fmtIndex, fmtNum, fmtPct } from '@/lib/market/format';
import type { IndexPoint, Quote } from '@/lib/market/types';

const EMPTY_INDEX_HISTORY: IndexPoint[] = [];

function pctColorClass(pct: number): string {
  if (pct > 0) return 'text-emerald-400';
  if (pct < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

function heatAlpha(pct: number): number {
  return Math.min(0.42, (Math.abs(pct) / 3) * 0.42);
}

export function MarketTab() {
  const index = useMarketStore((s) => s.index);
  const indexHistory = useMarketStore(
    (s) => (s.index?.history ? s.index.history : EMPTY_INDEX_HISTORY)
  );
  // Derive the ordered quote list locally (selectors must return stable refs).
  const stocks = useMarketStore((s) => s.stocks);
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const quotes = useMemo(
    () => stockOrder.filter((sym) => stocks[sym]).map((sym) => stocks[sym]),
    [stockOrder, stocks]
  );
  const setSelected = useMarketStore((s) => s.setSelected);

  const breadth = useMemo(() => {
    let adv = 0;
    let dec = 0;
    let unch = 0;
    for (const q of quotes) {
      if (q.changePct > 0) adv++;
      else if (q.changePct < 0) dec++;
      else unch++;
    }
    const total = Math.max(1, adv + dec + unch);
    return { adv, dec, unch, advPct: (adv / total) * 100, decPct: (dec / total) * 100, unchPct: (unch / total) * 100 };
  }, [quotes]);

  const gainers = useMemo(
    () => [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 5),
    [quotes]
  );
  const losers = useMemo(
    () => [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 5),
    [quotes]
  );
  const active = useMemo(
    () => [...quotes].sort((a, b) => b.volume - a.volume).slice(0, 5),
    [quotes]
  );

  // Impact-weighted news sentiment over the latest 25 headlines.
  const news = useMarketStore((s) => s.news);
  const sentiment = useMemo(
    () => newsSentiment(news.slice(0, 25)),
    [news]
  );

  const idxPoints = useMemo(
    () => indexHistory.map((p) => ({ t: p.t, v: p.v })),
    [indexHistory]
  );
  const idxUp = index ? index.value >= index.prevClose : true;

  return (
    <div className="space-y-4">
      {/* LASI mini chart */}
      <section aria-label="LASI intraday" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              LASI · Intraday
            </p>
            <p className="font-mono text-xl font-bold tabular-nums text-zinc-100">
              {index ? fmtIndex(index.value) : '—'}
            </p>
          </div>
          <p className={`font-mono text-sm font-semibold tabular-nums ${idxUp ? 'text-emerald-400' : 'text-rose-400'}`}>
            {index ? fmtPct(index.changePct) : '—'}
          </p>
        </div>
        <div className="mt-2 h-24">
          {idxPoints.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={idxPoints} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="lasiFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#f97316"
                  strokeWidth={1.6}
                  fill="url(#lasiFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-zinc-950/60 text-[11px] text-zinc-600">
              Waiting for intraday index ticks…
            </div>
          )}
        </div>
      </section>

      {/* Breadth */}
      <section aria-label="Market breadth" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Breadth · {quotes.length} counters
        </p>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-950 ring-1 ring-zinc-800">
          <div className="bg-emerald-500/80" style={{ width: `${breadth.advPct}%` }} aria-hidden="true" />
          <div className="bg-zinc-600" style={{ width: `${breadth.unchPct}%` }} aria-hidden="true" />
          <div className="bg-rose-500/80" style={{ width: `${breadth.decPct}%` }} aria-hidden="true" />
        </div>
        <div className="mt-2 grid grid-cols-3 text-center">
          <div>
            <p className="font-mono text-sm font-bold tabular-nums text-emerald-400">{breadth.adv}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Advancers</p>
          </div>
          <div>
            <p className="font-mono text-sm font-bold tabular-nums text-zinc-400">{breadth.unch}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Unchanged</p>
          </div>
          <div>
            <p className="font-mono text-sm font-bold tabular-nums text-rose-400">{breadth.dec}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Decliners</p>
          </div>
        </div>
      </section>

      {/* News sentiment gauge */}
      <section aria-label="News sentiment" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            <Newspaper className="h-3 w-3" aria-hidden="true" />
            News Sentiment
          </p>
          <p
            className={`text-[10px] font-bold uppercase tracking-wider ${
              sentiment.label === 'BULLISH'
                ? 'text-emerald-400'
                : sentiment.label === 'BEARISH'
                  ? 'text-rose-400'
                  : 'text-zinc-400'
            }`}
          >
            {sentiment.label}
          </p>
        </div>
        {/* Meter: rose (bearish) ← → emerald (bullish) with score marker */}
        <div className="relative h-2.5 w-full overflow-visible rounded-full bg-gradient-to-r from-rose-500/70 via-zinc-700 to-emerald-500/70" aria-hidden="true">
          <div
            className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-zinc-100 ring-2 ring-zinc-950 transition-[left] duration-500"
            style={{ left: `${50 + Math.max(-50, Math.min(50, sentiment.score)) / 2}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums">
          <span className="text-rose-400">{sentiment.negative} NEG</span>
          <span className="font-semibold text-zinc-300">
            {sentiment.score > 0 ? '+' : ''}{sentiment.score}
          </span>
          <span className="text-emerald-400">{sentiment.positive} POS</span>
        </div>
      </section>

      {/* Heatmap */}
      <section aria-label="Market capitalisation heatmap" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Heatmap · size = market cap
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quotes.map((q) => {
            const alpha = heatAlpha(q.changePct);
            const bg =
              q.changePct > 0
                ? `rgba(16, 185, 129, ${alpha})`
                : q.changePct < 0
                  ? `rgba(244, 63, 94, ${alpha})`
                  : 'rgba(113, 113, 122, 0.14)';
            return (
              <motion.button
                key={q.symbol}
                type="button"
                layout
                onClick={() => setSelected(q.symbol)}
                style={{ backgroundColor: bg, flexGrow: Math.max(0.4, q.marketCap / 5e9) }}
                className="flex min-w-[86px] cursor-pointer flex-col items-start rounded-md border border-zinc-800 px-2 py-1.5 text-left transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
                aria-label={`${q.symbol}, market cap ${fmtBig(q.marketCap)}, ${fmtPct(q.changePct)}`}
              >
                <span className="text-[11px] font-bold tracking-wide text-zinc-100">
                  {q.symbol}
                </span>
                <span className={`font-mono text-[11px] tabular-nums ${pctColorClass(q.changePct)}`}>
                  {fmtPct(q.changePct)}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Movers */}
      <div className="grid gap-3">
        <MoverList
          title="Top Gainers"
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />}
          quotes={gainers}
          metric={(q) => fmtPct(q.changePct)}
          metricClass={(q) => pctColorClass(q.changePct)}
          onSelect={setSelected}
        />
        <MoverList
          title="Top Losers"
          icon={<TrendingDown className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />}
          quotes={losers}
          metric={(q) => fmtPct(q.changePct)}
          metricClass={(q) => pctColorClass(q.changePct)}
          onSelect={setSelected}
        />
        <MoverList
          title="Most Active"
          icon={<Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />}
          quotes={active}
          metric={(q) => `${fmtNum(q.volume)} shs`}
          metricClass={() => 'text-zinc-300'}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}

function MoverList({
  title,
  icon,
  quotes,
  metric,
  metricClass,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  quotes: Quote[];
  metric: (q: Quote) => string;
  metricClass: (q: Quote) => string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </p>
      </div>
      {quotes.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-zinc-600">Loading market data…</p>
      ) : (
        <ul className="space-y-0.5">
          {quotes.map((q) => (
            <li key={q.symbol}>
              <button
                type="button"
                onClick={() => onSelect(q.symbol)}
                className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
              >
                <span className="text-xs font-semibold tracking-wide text-zinc-200">
                  {q.symbol}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs tabular-nums text-zinc-300">
                    {q.price > 0 ? fmtIndex(q.price) : '—'}
                  </span>
                  <span className={`w-16 text-right font-mono text-xs tabular-nums ${metricClass(q)}`}>
                    {metric(q)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
