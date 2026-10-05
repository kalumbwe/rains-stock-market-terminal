'use client';

/**
 * Order book — 5 bids (emerald depth bars) vs 5 asks (rose depth bars),
 * bar widths relative to the largest size on either side.
 * GET /api/stocks/[sym]/orderbook, refetched every 5s + on symbol change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownUp } from 'lucide-react';
import { fmtK, fmtNum } from '@/lib/market/format';
import type { OrderBookResponse } from '@/lib/market/types';

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
    </section>
  );
}
