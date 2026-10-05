'use client';

/**
 * 2×4 stats grid: Open, Prev Close, Day High, Day Low, Volume,
 * Value Traded, Market Cap, 52W Range.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { fmtBig, fmtK, fmtNum } from '@/lib/market/format';
import type { Quote, StockProfile } from '@/lib/market/types';

export function StatsGrid({
  quote,
  profile,
}: {
  quote: Quote | null;
  profile: StockProfile | null;
}) {
  const cells: { label: string; value: string }[] = quote
    ? [
        { label: 'Open', value: fmtK(quote.dayOpen) },
        { label: 'Prev Close', value: fmtK(quote.prevClose) },
        { label: 'Day High', value: fmtK(quote.dayHigh) },
        { label: 'Day Low', value: fmtK(quote.dayLow) },
        { label: 'Volume', value: fmtNum(quote.volume) },
        { label: 'Value Traded', value: fmtBig(quote.valueTraded) },
        { label: 'Market Cap', value: fmtBig(quote.marketCap) },
        {
          label: '52W Range',
          value:
            profile &&
            Number.isFinite(profile.fiftyTwoWeekLow) &&
            Number.isFinite(profile.fiftyTwoWeekHigh)
              ? `${fmtK(profile.fiftyTwoWeekLow)} — ${fmtK(profile.fiftyTwoWeekHigh)}`
              : '—',
        },
      ]
    : Array.from({ length: 8 }, () => ({ label: '', value: '' }));

  return (
    <section aria-label="Key statistics" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((cell, i) =>
        quote ? (
          <div
            key={cell.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {cell.label}
            </p>
            <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-zinc-100">
              {cell.value}
            </p>
          </div>
        ) : (
          <div key={`sk-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <Skeleton className="h-2.5 w-14 bg-zinc-800" />
            <Skeleton className="mt-1.5 h-4 w-16 bg-zinc-800/70" />
          </div>
        )
      )}
    </section>
  );
}
