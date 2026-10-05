'use client';

/**
 * News tab — sentiment-badged feed from GET /api/news + socket `news`
 * prepend (store). Symbol chips select the related stock.
 */

import { motion } from 'framer-motion';
import { Newspaper, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import { fmtAgo, fmtDateTime } from '@/lib/market/format';
import type { Impact, NewsItem, Sentiment } from '@/lib/market/types';

function sentimentBadge(sentiment: Sentiment): string {
  switch (sentiment) {
    case 'POSITIVE':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'NEGATIVE':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-400';
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-400';
  }
}

function impactOpacity(impact: Impact): string {
  switch (impact) {
    case 'HIGH':
      return 'bg-orange-500 opacity-100';
    case 'MEDIUM':
      return 'bg-orange-500 opacity-60';
    default:
      return 'bg-orange-500 opacity-30';
  }
}

export function NewsTab() {
  const news = useMarketStore((s) => s.news);
  const setSelected = useMarketStore((s) => s.setSelected);
  const connected = useMarketStore((s) => s.connected);

  if (news.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading news">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <Skeleton className="h-3 w-24 bg-zinc-800" />
            <Skeleton className="mt-2 h-4 w-full bg-zinc-800/80" />
            <Skeleton className="mt-1.5 h-3 w-3/4 bg-zinc-800/60" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-label="Market news feed">
      {connected && (
        <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-zinc-500">
          <Radio className="h-3 w-3 animate-pulse text-orange-500" aria-hidden="true" />
          Live feed — new headlines appear automatically
        </p>
      )}
      {news.map((item, idx) => (
        <NewsCard
          key={item.id}
          item={item}
          fresh={idx === 0}
          onSelect={setSelected}
        />
      ))}
    </div>
  );
}

function NewsCard({
  item,
  fresh,
  onSelect,
}: {
  item: NewsItem;
  fresh: boolean;
  onSelect: (symbol: string) => void;
}) {
  return (
    <motion.article
      layout
      initial={fresh ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition-colors hover:border-zinc-700"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${impactOpacity(item.impact)}`}
            title={`${item.impact} impact`}
            aria-label={`${item.impact} impact`}
          />
          <Badge
            variant="outline"
            className={`h-4.5 px-1.5 py-0 text-[9px] font-bold tracking-wider ${sentimentBadge(item.sentiment)}`}
          >
            {item.sentiment}
          </Badge>
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">
            {item.source}
          </span>
        </div>
        <time
          dateTime={item.publishedAt}
          title={fmtDateTime(item.publishedAt)}
          className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500"
        >
          {fmtAgo(item.publishedAt)}
        </time>
      </div>

      <h4 className="mt-1.5 text-sm font-bold leading-snug text-zinc-100">
        {item.headline}
      </h4>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
        {item.body}
      </p>

      {item.symbols.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.symbols.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => onSelect(sym)}
              className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-orange-400 transition-colors hover:bg-orange-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
              aria-label={`View ${sym}`}
            >
              {sym}
            </button>
          ))}
        </div>
      )}
    </motion.article>
  );
}
