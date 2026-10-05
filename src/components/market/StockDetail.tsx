'use client';

/**
 * Center column — selected stock detail: live big price with tick flash,
 * day range bar, Buy/Sell actions, chart, stats grid, technicals, order book.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PriceChart } from './PriceChart';
import { StatsGrid } from './StatsGrid';
import { TechnicalsCard } from './TechnicalsCard';
import { OrderBook } from './OrderBook';
import { useMarketStore } from '@/lib/market/store';
import { fmtK, fmtPct, fmtSignedK } from '@/lib/market/format';
import type { StockDetailResponse } from '@/lib/market/types';

interface StockDetailProps {
  symbol: string;
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void;
}

export function StockDetail({ symbol, onTrade }: StockDetailProps) {
  const quote = useMarketStore((s) => s.stocks[symbol]);
  const flash = useMarketStore((s) => s.flash[symbol]);
  const [profile, setProfile] = useState<StockDetailResponse['profile'] | null>(null);
  const [profileError, setProfileError] = useState(false);
  const aliveRef = useRef(true);

  const loadProfile = useCallback(async () => {
    setProfileError(false);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`detail ${res.status}`);
      const data = (await res.json()) as StockDetailResponse;
      if (aliveRef.current) setProfile(data.profile);
    } catch {
      if (!aliveRef.current) return;
      // One delayed retry — a transient dev-server/engine hiccup should not
      // permanently hide the 52W range + fundamentals for this session.
      setTimeout(() => {
        if (!aliveRef.current) return;
        void (async () => {
          try {
            const res = await fetch(`/api/stocks/${encodeURIComponent(symbol)}`, {
              cache: 'no-store',
            });
            if (!res.ok) throw new Error(`detail retry ${res.status}`);
            const data = (await res.json()) as StockDetailResponse;
            if (aliveRef.current) setProfile(data.profile);
          } catch {
            if (aliveRef.current) setProfileError(true);
          }
        })();
      }, 5000);
    }
  }, [symbol]);

  useEffect(() => {
    aliveRef.current = true;
    setProfile(null);
    void loadProfile();
    return () => {
      aliveRef.current = false;
    };
  }, [loadProfile]);

  const price = quote?.price;
  const pct = quote?.changePct ?? 0;
  const change = quote?.change ?? 0;
  const changeColor =
    pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-rose-400' : 'text-zinc-400';
  const ChangeIcon = pct >= 0 ? ArrowUpRight : ArrowDownRight;

  const rangeLow = quote?.dayLow ?? 0;
  const rangeHigh = quote?.dayHigh ?? 0;
  const markerPct =
    price !== null && price !== undefined && rangeHigh > rangeLow
      ? Math.min(100, Math.max(0, ((price - rangeLow) / (rangeHigh - rangeLow)) * 100))
      : 50;

  const flashClass =
    flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : '';

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Header card ── */}
      <section
        aria-label={`${symbol} overview`}
        className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
      >
        {/* Ambient price-direction glow (pure decoration) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl ${
            pct >= 0 ? 'bg-emerald-500/[0.07]' : 'bg-rose-500/[0.07]'
          }`}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-wide text-zinc-100">{symbol}</h2>
              {quote?.sector ? (
                <Badge
                  variant="outline"
                  className="h-5 border-zinc-700 bg-zinc-800/80 text-[10px] uppercase tracking-wider text-zinc-400"
                >
                  {quote.sector}
                </Badge>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-sm text-zinc-400">
              {quote ? quote.name : <Skeleton className="h-4 w-56 bg-zinc-800" />}
            </div>
            {profile?.website ? (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                {profile.website}
              </p>
            ) : null}
            {profile && profile.dividendYield > 0 ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-400" aria-label={`Dividend yield ${profile.dividendYield} percent`}>
                <span aria-hidden="true">◆</span>
                {profile.dividendYield.toFixed(1)}% div yld
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => onTrade(symbol, 'BUY')}
              className="h-10 min-w-24 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:ring-emerald-500/50"
              aria-label={`Buy ${symbol}`}
            >
              Buy
            </Button>
            <Button
              onClick={() => onTrade(symbol, 'SELL')}
              className="h-10 min-w-24 bg-rose-500 font-semibold text-zinc-950 hover:bg-rose-400 focus-visible:ring-rose-500/50"
              aria-label={`Sell ${symbol}`}
            >
              Sell
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div
            className={`rounded-lg px-2 py-0.5 ${flashClass}`}
            aria-live="off"
          >
            <motion.span
              key={price ?? 'na'}
              initial={{ opacity: 0.35, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="inline-block font-mono text-4xl font-bold tabular-nums tracking-tight text-zinc-50"
            >
              {price !== undefined ? fmtK(price) : <Skeleton className="h-10 w-44 bg-zinc-800" />}
            </motion.span>
          </div>
          {quote ? (
            <div className={`flex items-center gap-1.5 pb-1 font-mono text-sm font-semibold tabular-nums ${changeColor}`}>
              <ChangeIcon className="h-4 w-4" aria-hidden="true" />
              <span>{fmtSignedK(change)}</span>
              <span>({fmtPct(pct)})</span>
            </div>
          ) : null}
        </div>

        {/* Day range bar with open-price marker */}
        <div className="mt-4" aria-label="Day range">
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-zinc-500">
            <span>Day Low {quote ? fmtK(rangeLow) : '—'}</span>
            {quote && rangeHigh > rangeLow && quote.dayOpen > rangeLow && quote.dayOpen < rangeHigh ? (
              <span className="text-zinc-600">Open {fmtK(quote.dayOpen)}</span>
            ) : null}
            <span>Day High {quote ? fmtK(rangeHigh) : '—'}</span>
          </div>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-600/50 to-orange-500/70"
              style={{ width: `${markerPct}%` }}
              aria-hidden="true"
            />
            {/* Open marker: hollow tick */}
            {quote && rangeHigh > rangeLow ? (
              <div
                className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-zinc-400/80"
                style={{
                  left: `${Math.min(100, Math.max(0, ((quote.dayOpen - rangeLow) / (rangeHigh - rangeLow)) * 100))}%`,
                }}
                aria-hidden="true"
              />
            ) : null}
            <div
              className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-orange-400 ring-2 ring-zinc-950 transition-[left] duration-500"
              style={{ left: `calc(${markerPct}% - 2px)` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <PriceChart symbol={symbol} />

      <StatsGrid quote={quote ?? null} profile={profile} />

      {profileError && !profile ? (
        <p className="text-center text-xs text-zinc-600">
          Company profile unavailable — 52W range hidden.
        </p>
      ) : null}

      <TechnicalsCard symbol={symbol} />

      <OrderBook symbol={symbol} />
    </div>
  );
}
