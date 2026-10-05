'use client';

/**
 * Related news — headlines for the selected symbol, drawn from the live
 * socket news log (engine + seeded). Compact rows with sentiment dot,
 * impact chip and relative time. Shows the symbol's day sentiment tally.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Newspaper } from 'lucide-react';
import { useMarketStore } from '@/lib/market/store';
import { fmtAgo } from '@/lib/market/format';

const SENTIMENT_DOT: Record<string, string> = {
  POSITIVE: 'bg-emerald-400',
  NEGATIVE: 'bg-rose-400',
  NEUTRAL: 'bg-zinc-500',
};

const IMPACT_STYLE: Record<string, string> = {
  HIGH: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  LOW: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

export function SymbolNews({ symbol }: { symbol: string }) {
  const news = useMarketStore((s) => s.news);

  const related = useMemo(() => {
    const items = news.filter((n) => n.symbols.includes(symbol)).slice(0, 5);
    const bullish = items.filter((n) => n.sentiment === 'POSITIVE').length;
    const bearish = items.filter((n) => n.sentiment === 'NEGATIVE').length;
    return { items, bullish, bearish };
  }, [news, symbol]);

  return (
    <section
      aria-label={`${symbol} related news`}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-zinc-200">Related News</h3>
          <span className="rounded bg-zinc-800 px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {symbol}
          </span>
        </div>
        {related.items.length > 0 ? (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {related.bullish > 0 ? (
              <span className="text-emerald-400">▲{related.bullish}</span>
            ) : null}{' '}
            {related.bearish > 0 ? (
              <span className="text-rose-400">▼{related.bearish}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {related.items.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-zinc-600">
          No {symbol} headlines yet — the wire updates every few minutes.
        </p>
      ) : (
        <ul className="luse-scroll max-h-56 space-y-1 overflow-y-auto p-2">
          {related.items.map((n, i) => (
            <motion.li
              key={n.id}
              initial={i === 0 ? { opacity: 0, y: -4 } : false}
              animate={{ opacity: 1, y: 0 }}
              className="news-card rounded-lg bg-zinc-950/50 px-2.5 py-2 ring-1 ring-zinc-800/60"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${SENTIMENT_DOT[n.sentiment] ?? 'bg-zinc-500'}`}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
                  {n.headline}
                </p>
                <span
                  className={`shrink-0 rounded border px-1 py-px font-mono text-[9px] font-bold uppercase ${IMPACT_STYLE[n.impact] ?? ''}`}
                >
                  {n.impact}
                </span>
              </div>
              <p className="mt-0.5 pl-3.5 font-mono text-[10px] tabular-nums text-zinc-600">
                {n.source} · {fmtAgo(n.publishedAt)}
              </p>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
