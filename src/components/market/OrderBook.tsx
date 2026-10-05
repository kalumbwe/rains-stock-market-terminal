'use client';

/**
 * Order book — 5 bids (emerald depth bars) vs 5 asks (rose depth bars),
 * bar widths relative to the largest size on either side, plus a cumulative
 * market-depth chart (stepped areas around the mid) and a bid/ask imbalance
 * meter. GET /api/stocks/[sym]/orderbook, refetched every 5s + on symbol change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { fmtK, fmtNum } from '@/lib/market/format';
import type { OrderBookResponse } from '@/lib/market/types';

/** One point on the cumulative depth curve (nulls split the two sides). */
interface DepthPoint {
  price: number;
  bid: number | null;
  ask: number | null;
}

function DepthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DepthPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950/95 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-300">
      @ {fmtK(p.price)}
      {p.bid !== null ? <span className="text-emerald-400"> · bid {fmtNum(p.bid)}</span> : null}
      {p.ask !== null ? <span className="text-rose-400"> · ask {fmtNum(p.ask)}</span> : null}
    </div>
  );
}

export function OrderBook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<OrderBookResponse | null>(null);
  const [error, setError] = useState(false);
  const aliveRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/stocks/${encodeURIComponent(symbol)}/orderbook`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`orderbook ${res.status}`);
      const data = (await res.json()) as OrderBookResponse;
      if (aliveRef.current && data.symbol === symbol) {
        setBook(data);
        setError(false);
      }
    } catch {
      if (aliveRef.current) setError(true);
    }
  }, [symbol]);

  useEffect(() => {
    aliveRef.current = true;
    setBook(null);
    setError(false);
    void fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => {
      aliveRef.current = false;
      clearInterval(timer);
    };
  }, [fetchData]);

  const maxSize = book
    ? Math.max(1, ...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size))
    : 1;
  const spread =
    book && book.bids[0] && book.asks[0]
      ? book.asks[0].price - book.bids[0].price
      : null;

  /* ----- Cumulative depth curve (bids left of mid, asks right) ----- */
  const depthData = useMemo<DepthPoint[]>(() => {
    if (!book || book.bids.length === 0 || book.asks.length === 0) return [];
    let cb = 0;
    const bidSeries = book.bids.map((b) => ({ price: b.price, bid: (cb += b.size) }));
    bidSeries.reverse(); // ascending price toward the mid
    let ca = 0;
    const askSeries = book.asks.map((a) => ({ price: a.price, ask: (ca += a.size) }));
    const mid = (book.bids[0].price + book.asks[0].price) / 2;
    return [
      ...bidSeries.map((r) => ({ price: r.price, bid: r.bid, ask: null as number | null })),
      { price: mid, bid: bidSeries[0]?.bid ?? null, ask: askSeries[0]?.ask ?? null },
      ...askSeries.map((r) => ({ price: r.price, bid: null as number | null, ask: r.ask })),
    ];
  }, [book]);

  /* ----- Bid/ask imbalance (total size across the 5 visible levels) ----- */
  const imbalance = useMemo(() => {
    if (!book) return null;
    const totalBid = book.bids.reduce((a, b) => a + b.size, 0);
    const totalAsk = book.asks.reduce((a, s) => a + s.size, 0);
    const denom = totalBid + totalAsk;
    if (denom <= 0) return null;
    return {
      totalBid,
      totalAsk,
      bidPct: Math.round((totalBid / denom) * 100),
      askPct: 100 - Math.round((totalBid / denom) * 100),
    };
  }, [book]);

  const midPrice =
    book && book.bids[0] && book.asks[0]
      ? (book.bids[0].price + book.asks[0].price) / 2
      : null;

  return (
    <section
      aria-label={`${symbol} order book`}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-zinc-200">Order Book</h3>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
          Spread{' '}
          {spread !== null ? (
            <span className="text-zinc-300">{fmtK(spread)}</span>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3">
        {error && !book ? (
          <div className="col-span-2 py-6 text-center text-xs text-zinc-500">
            Order book unavailable — retrying every 5s…
          </div>
        ) : !book ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`b-${i}`} className="h-6 bg-zinc-800/60" />
            ))}
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`a-${i}`} className="h-6 bg-zinc-800/60" />
            ))}
          </>
        ) : (
          <>
            {/* Bids */}
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                Bids
              </p>
              <div className="space-y-1">
                {book.bids.map((b, i) => (
                  <div key={`bid-${i}`} className="relative flex h-6 items-center overflow-hidden rounded">
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-500/15"
                      style={{ width: `${(b.size / maxSize) * 100}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 w-16 pl-1.5 font-mono text-[11px] font-medium tabular-nums text-emerald-400">
                      {fmtK(b.price)}
                    </span>
                    <span className="relative z-10 ml-auto pr-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
                      {fmtNum(b.size)}
                    </span>
                  </div>
                ))}
                {book.bids.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-zinc-600">No bids</p>
                )}
              </div>
            </div>
            {/* Asks */}
            <div>
              <p className="mb-1.5 text-right text-[10px] font-bold uppercase tracking-widest text-rose-400">
                Asks
              </p>
              <div className="space-y-1">
                {book.asks.map((a, i) => (
                  <div key={`ask-${i}`} className="relative flex h-6 items-center overflow-hidden rounded">
                    <div
                      className="absolute inset-y-0 right-0 bg-rose-500/15"
                      style={{ width: `${(a.size / maxSize) * 100}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 w-16 pl-1.5 font-mono text-[11px] font-medium tabular-nums text-rose-400">
                      {fmtK(a.price)}
                    </span>
                    <span className="relative z-10 ml-auto pr-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
                      {fmtNum(a.size)}
                    </span>
                  </div>
                ))}
                {book.asks.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-zinc-600">No asks</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Depth chart + imbalance meter */}
      {book && depthData.length > 0 && imbalance ? (
        <div className="border-t border-zinc-800/80 px-3 pb-3 pt-2.5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Depth · 5 levels
            </p>
            <p className="font-mono text-[10px] tabular-nums text-zinc-500">
              mid{' '}
              <span className="text-zinc-300">
                {midPrice !== null ? fmtK(Math.round(midPrice * 100) / 100) : '—'}
              </span>
            </p>
          </div>
          <ResponsiveContainer width="100%" height={92}>
            <AreaChart
              data={depthData}
              margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient id="depthBidFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="depthAskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#fb7185" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="linear"
                tick={{ fontSize: 9, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                tickCount={3}
                tickFormatter={(v: number) => v.toFixed(2)}
                minTickGap={24}
              />
              <Tooltip content={<DepthTooltip />} cursor={{ stroke: '#f97316', strokeOpacity: 0.3 }} />
              <Area
                type="stepBefore"
                dataKey="bid"
                stroke="#34d399"
                strokeWidth={1.4}
                fill="url(#depthBidFill)"
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="stepAfter"
                dataKey="ask"
                stroke="#fb7185"
                strokeWidth={1.4}
                fill="url(#depthAskFill)"
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Imbalance meter */}
          <div className="mt-1.5" aria-label={`Order flow imbalance ${imbalance.bidPct}% bids`}>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tabular-nums">
              <span className="text-emerald-400">
                {imbalance.bidPct}% bid · {fmtNum(imbalance.totalBid)}
              </span>
              <span className="text-rose-400">
                {fmtNum(imbalance.totalAsk)} · {imbalance.askPct}% ask
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-l-full bg-gradient-to-r from-emerald-600/70 to-emerald-400/80 transition-[width] duration-700"
                style={{ width: `${imbalance.bidPct}%` }}
              />
              <div
                className="h-full rounded-r-full bg-gradient-to-l from-rose-600/70 to-rose-400/80 transition-[width] duration-700"
                style={{ width: `${imbalance.askPct}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
