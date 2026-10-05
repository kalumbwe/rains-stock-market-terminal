'use client';

/**
 * Technicals card — SMA20 / SMA50 / RSI(14) plus risk metrics (annualised
 * volatility, max drawdown, 20d average volume) computed client-side from
 * daily candles (GET /api/stocks/[sym]/candles?interval=1d) with a
 * composite signal badge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge } from 'lucide-react';
import {
  annualizedVolatility,
  maxDrawdown,
  rsi,
  signalFrom,
  sma,
} from '@/lib/market/indicators';
import { fmtK, fmtNum } from '@/lib/market/format';
import type { Candle } from '@/lib/market/types';

const DAILY_LIMIT = 130; // enough history for SMA50 + RSI warm-up

export function TechnicalsCard({ symbol }: { symbol: string }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState(false);
  const aliveRef = useRef(true);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(
        `/api/stocks/${encodeURIComponent(symbol)}/candles?interval=1d&limit=${DAILY_LIMIT}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`candles ${res.status}`);
      const data = (await res.json()) as { candles: Candle[] };
      if (aliveRef.current) setCandles(data.candles ?? []);
    } catch {
      if (aliveRef.current) {
        setError(true);
        setCandles(null);
      }
    }
  }, [symbol]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchData();
    return () => {
      aliveRef.current = false;
    };
  }, [fetchData]);

  const technicals = useMemo(() => {
    if (!candles || candles.length < 15) return null;
    const closes = candles.map((c) => c.c);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    return {
      sma20,
      sma50,
      rsi14,
      signal: signalFrom(sma20, sma50, rsi14),
      annVol: annualizedVolatility(closes),
      mdd: maxDrawdown(closes),
      avgVol20:
        candles.length >= 5
          ? candles.slice(-20).reduce((a, c) => a + c.v, 0) / Math.min(20, candles.length)
          : null,
    };
  }, [candles]);

  const signalBadge =
    technicals?.signal === 'BULLISH'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
      : technicals?.signal === 'BEARISH'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
        : 'border-zinc-700 bg-zinc-800 text-zinc-400';

  return (
    <section
      aria-label="Technical indicators"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-zinc-200">Technicals</h3>
        </div>
        {technicals ? (
          <Badge className={`h-5 border text-[10px] font-bold tracking-wider ${signalBadge}`}>
            {technicals.signal}
          </Badge>
        ) : null}
      </div>
      <div className="p-3">
        {error ? (
          <p className="py-2 text-center text-xs text-zinc-500">
            Indicators unavailable (daily data offline).
          </p>
        ) : !technicals ? (
          <div className="flex items-center justify-between gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 flex-1 bg-zinc-800/60" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                SMA 20
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                {technicals.sma20 !== null ? fmtK(technicals.sma20) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                SMA 50
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                {technicals.sma50 !== null ? fmtK(technicals.sma50) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                RSI 14
              </p>
              <p
                className={`font-mono text-sm font-semibold tabular-nums ${
                  technicals.rsi14 !== null && technicals.rsi14 >= 70
                    ? 'text-rose-400'
                    : technicals.rsi14 !== null && technicals.rsi14 <= 30
                      ? 'text-emerald-400'
                      : 'text-zinc-100'
                }`}
              >
                {technicals.rsi14 !== null ? technicals.rsi14.toFixed(1) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Ann. Vol
              </p>
              <p
                className={`font-mono text-sm font-semibold tabular-nums ${
                  technicals.annVol !== null && technicals.annVol > 35
                    ? 'text-rose-400'
                    : technicals.annVol !== null && technicals.annVol < 20
                      ? 'text-emerald-400'
                      : 'text-zinc-100'
                }`}
              >
                {technicals.annVol !== null ? `${technicals.annVol.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Max DD
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums text-rose-400">
                {technicals.mdd !== null ? `−${technicals.mdd.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-2.5 py-2 ring-1 ring-zinc-800">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Avg Vol 20d
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                {technicals.avgVol20 !== null ? fmtNum(technicals.avgVol20) : '—'}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
