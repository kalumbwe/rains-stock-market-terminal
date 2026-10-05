'use client';

/**
 * Full-width auto-scrolling ticker tape. CSS marquee (duplicated content,
 * translateX -50%), pauses on hover, flash bg on tick, click selects symbol.
 */

import { useMemo } from 'react';
import { useMarketStore } from '@/lib/market/store';
import { fmtK, fmtPct } from '@/lib/market/format';

function changeColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

export function TickerTape() {
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const stocks = useMarketStore((s) => s.stocks);
  const flash = useMarketStore((s) => s.flash);
  const setSelected = useMarketStore((s) => s.setSelected);

  const items = useMemo(
    () =>
      stockOrder.map((sym) => {
        const q = stocks[sym];
        return q ? { sym, price: q.price, pct: q.changePct } : null;
      }),
    [stockOrder, stocks]
  );

  if (items.length === 0) {
    return (
      <div className="overflow-hidden border-b border-zinc-800 bg-zinc-950">
        <div className="flex h-9 items-center gap-6 px-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="h-3 w-24 animate-pulse rounded bg-zinc-800/80"
              style={{ opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Two copies of the strip for a seamless -50% loop.
  const strip = [...items, ...items];

  return (
    <div
      className="tape-container tape-hover overflow-hidden border-b border-zinc-800 bg-zinc-950"
      role="marquee"
      aria-label="Live market ticker tape"
    >
      <div className="animate-tape flex w-max items-center py-0">
        {strip.map((item, idx) =>
          item ? (
            <button
              key={`${item.sym}-${idx}`}
              type="button"
              onClick={() => setSelected(item.sym)}
              className={`flex min-w-max items-center gap-2 border-r border-zinc-800/70 px-4 py-1.5 text-xs transition-colors hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500/60 ${
                flash[item.sym] === 'up'
                  ? 'flash-up'
                  : flash[item.sym] === 'down'
                    ? 'flash-down'
                    : ''
              }`}
              aria-label={`Select ${item.sym}, price ${fmtK(item.price)}, ${fmtPct(item.pct)}`}
            >
              <span className="font-semibold tracking-wider text-zinc-200">{item.sym}</span>
              <span className="font-mono tabular-nums text-zinc-300">{fmtK(item.price)}</span>
              <span className={`font-mono font-medium tabular-nums ${changeColor(item.pct)}`}>
                {fmtPct(item.pct)}
              </span>
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}
