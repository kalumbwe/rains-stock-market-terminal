'use client';

/**
 * Portfolio Insights — benchmark & risk analytics for the paper account.
 *
 * Fetches fundamentals (beta, dividend yield) from /api/screener once per
 * session and derives, entirely client-side from live quotes:
 *  - Day alpha: portfolio day change % vs LASI day change % (animated bars)
 *  - Portfolio beta (position-weighted) with a Defensive/Neutral/Aggressive read
 *  - Projected annual dividend income + effective yield + est. quarterly payout
 *  - Concentration: HHI classification + largest holding share
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Coins, ShieldHalf, Sigma } from 'lucide-react';
import { useMarketStore } from '@/lib/market/store';
import { fmtK, fmtMoney, fmtPct } from '@/lib/market/format';
import type { Position } from '@/lib/market/types';

interface ScreenerRow {
  symbol: string;
  beta: number;
  dividendYield: number;
}

interface ScreenerResponse {
  rows: ScreenerRow[];
}

interface PortfolioInsightsProps {
  positions: Position[];
  cash: number | null;
  /** Total portfolio value (equity + cash) — the weighting base. */
  totalValue: number;
}

/** HHI (0–1) → diversification label. */
function concentrationLabel(hhi: number): { label: string; className: string } {
  if (hhi >= 0.5)
    return { label: 'Very concentrated', className: 'text-rose-400' };
  if (hhi >= 0.3)
    return { label: 'Concentrated', className: 'text-amber-400' };
  if (hhi >= 0.15)
    return { label: 'Moderately spread', className: 'text-orange-400' };
  return { label: 'Well diversified', className: 'text-emerald-400' };
}

function betaLabel(beta: number): { label: string; className: string } {
  if (beta < 0.85)
    return { label: 'Defensive', className: 'text-emerald-400' };
  if (beta <= 1.15)
    return { label: 'Market-like', className: 'text-zinc-300' };
  return { label: 'Aggressive', className: 'text-amber-400' };
}

export function PortfolioInsights({ positions, cash, totalValue }: PortfolioInsightsProps) {
  const stocks = useMarketStore((s) => s.stocks);
  const index = useMarketStore((s) => s.index);
  const [funds, setFunds] = useState<Map<string, ScreenerRow>>(new Map());
  const [fundsReady, setFundsReady] = useState(false);
  const inflightRef = useRef(false);

  // Fundamentals are static per session — fetch once (beta, dividendYield).
  useEffect(() => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/screener', { cache: 'no-store' });
        if (!res.ok) throw new Error(`screener ${res.status}`);
        const data = (await res.json()) as ScreenerResponse;
        setFunds(new Map((data.rows ?? []).map((r) => [r.symbol, r])));
      } catch {
        /* insights simply render without fundamentals */
      } finally {
        setFundsReady(true);
        inflightRef.current = false;
      }
    })();
  }, []);

  const insights = useMemo(() => {
    if (positions.length === 0 || totalValue <= 0) return null;

    let equityPrev = 0; // equity value at yesterday's closes
    let equityDayChange = 0; // Σ qty × today's change
    let weightBetaNum = 0;
    let annualDiv = 0;
    const weights: number[] = [];

    for (const p of positions) {
      const q = stocks[p.symbol];
      const live = q?.price ?? p.avgCost;
      const value = p.quantity * live;
      const prevValue = p.quantity * (q?.prevClose ?? p.avgCost);
      equityPrev += prevValue;
      equityDayChange += value - prevValue;
      weightBetaNum += (value / totalValue) * (funds.get(p.symbol)?.beta ?? 1);
      annualDiv += value * ((funds.get(p.symbol)?.dividendYield ?? 0) / 100);
      weights.push(value / totalValue);
    }

    const equity = equityPrev + equityDayChange;
    const portfolioDayPct = equityPrev > 0 ? (equityDayChange / equityPrev) * 100 : 0;
    const lasiDayPct = index?.changePct ?? null;
    const dayAlpha = lasiDayPct !== null ? portfolioDayPct - lasiDayPct : null;

    const hhi = weights.reduce((a, w) => a + w * w, 0);
    const largestW = weights.length > 0 ? Math.max(...weights) : 0;

    return {
      portfolioDayPct,
      lasiDayPct,
      dayAlpha,
      beta: weightBetaNum,
      annualDiv,
      divYieldPct: (annualDiv / totalValue) * 100,
      quarterlyDiv: annualDiv / 4,
      hhi,
      largestW,
    };
  }, [positions, stocks, totalValue, funds, index]);

  if (positions.length === 0 || !insights) {
    return (
      <section
        aria-label="Portfolio insights"
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
      >
        <Header />
        <p className="mt-2 text-xs text-zinc-600">
          Insights appear once you hold a position — benchmark alpha, beta, dividend
          income and concentration are computed from live ticks.
        </p>
      </section>
    );
  }

  const alpha = insights.dayAlpha;
  const alphaColor =
    alpha === null ? 'text-zinc-400' : alpha >= 0 ? 'text-emerald-400' : 'text-rose-400';
  const betaRead = betaLabel(insights.beta);
  const concRead = concentrationLabel(insights.hhi);

  // Day-change bar pair — normalize widths against the larger absolute move.
  const barScale = Math.max(
    Math.abs(insights.portfolioDayPct),
    Math.abs(insights.lasiDayPct ?? 0),
    0.5
  );
  const portBarW = Math.min(100, (Math.abs(insights.portfolioDayPct) / barScale) * 100);
  const lasiBarW =
    insights.lasiDayPct !== null
      ? Math.min(100, (Math.abs(insights.lasiDayPct) / barScale) * 100)
      : 0;

  return (
    <section
      aria-label="Portfolio insights"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
    >
      <Header />

      {/* Day alpha vs LASI — animated paired bars */}
      <div className="mt-3 rounded-lg bg-zinc-950/60 p-2.5 ring-1 ring-zinc-800/70">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">
            Day change vs LASI
          </p>
          <p
            className={`font-mono text-sm font-bold tabular-nums ${alphaColor}`}
            title={
              alpha === null
                ? 'Waiting for index ticks'
                : `${alpha >= 0 ? 'Outperforming' : 'Trailing'} the index by ${Math.abs(alpha).toFixed(2)} pct-pts today`
            }
          >
            {alpha === null ? '—' : `${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)} pts`}
          </p>
        </div>
        <div className="mt-2 space-y-1.5" role="img" aria-label="Portfolio day change versus LASI">
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              You
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
              <motion.div
                className={`h-full rounded-full ${
                  insights.portfolioDayPct >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${portBarW}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
            <span
              className={`w-14 shrink-0 font-mono text-[10px] tabular-nums ${
                insights.portfolioDayPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fmtPct(insights.portfolioDayPct)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              LASI
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
              <motion.div
                className={`h-full rounded-full ${
                  (insights.lasiDayPct ?? 0) >= 0 ? 'bg-orange-500/80' : 'bg-orange-500/80'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${lasiBarW}%` }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
              />
            </div>
            <span className="w-14 shrink-0 font-mono text-[10px] tabular-nums text-orange-400">
              {insights.lasiDayPct !== null ? fmtPct(insights.lasiDayPct) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Risk & income tiles */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {/* Beta */}
        <div
          className="group rounded-lg bg-zinc-950/60 p-2.5 ring-1 ring-zinc-800/70 transition-colors hover:ring-zinc-700"
          title="Book beta vs the LASI index — value-weighted across positions and cash (cash = 0), from seeded fundamentals"
        >
          <div className="flex items-center gap-1">
            <Sigma className="h-3 w-3 text-zinc-500 transition-colors group-hover:text-orange-400" aria-hidden="true" />
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Portfolio beta</p>
          </div>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-zinc-100">
            {fundsReady ? insights.beta.toFixed(2) : '…'}
          </p>
          <p className={`text-[9px] font-semibold uppercase tracking-wider ${betaRead.className}`}>
            {fundsReady ? betaRead.label : ''}
          </p>
        </div>

        {/* Dividend projection */}
        <div
          className="group rounded-lg bg-zinc-950/60 p-2.5 ring-1 ring-zinc-800/70 transition-colors hover:ring-zinc-700"
          title="Projected income if current live weights and seeded yields held for a year"
        >
          <div className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-zinc-500 transition-colors group-hover:text-amber-400" aria-hidden="true" />
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Est. dividends / yr</p>
          </div>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-amber-400">
            {fundsReady ? fmtMoney(insights.annualDiv) : '…'}
          </p>
          <p className="text-[9px] font-medium tabular-nums text-zinc-500">
            {fundsReady
              ? `${insights.divYieldPct.toFixed(2)}% yield · ~${fmtK(insights.quarterlyDiv)}/qtr`
              : ''}
          </p>
        </div>

        {/* Concentration */}
        <div
          className="group rounded-lg bg-zinc-950/60 p-2.5 ring-1 ring-zinc-800/70 transition-colors hover:ring-zinc-700"
          title={`Herfindahl index ${(insights.hhi * 10000).toFixed(0)} / 10000 · includes cash weight`}
        >
          <div className="flex items-center gap-1">
            <ShieldHalf className="h-3 w-3 text-zinc-500 transition-colors group-hover:text-emerald-400" aria-hidden="true" />
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Concentration</p>
          </div>
          <p className={`mt-1 text-xs font-bold ${concRead.className}`}>
            {fundsReady ? concRead.label : '…'}
          </p>
          <p className="text-[9px] font-medium tabular-nums text-zinc-500">
            top holding {(insights.largestW * 100).toFixed(0)}% of book
          </p>
        </div>
      </div>

      <p className="mt-2 text-center text-[9px] italic text-zinc-600">
        Beta &amp; yields from seeded fundamentals · alpha recomputed on every live tick
      </p>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-1.5">
      <Activity className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Portfolio Insights
      </p>
    </div>
  );
}
