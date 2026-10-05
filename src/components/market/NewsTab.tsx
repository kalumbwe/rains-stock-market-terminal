'use client';

/**
 * News tab — sentiment-badged feed from GET /api/news + socket `news`
 * prepend (store). Adds a filter bar: free-text search, sentiment chips
 * and a company-only toggle (drops macro headlines). Symbol chips select
 * the related stock.
 */

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Newspaper, Radio, Search, SlidersHorizontal } from 'lucide-react';
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

type SentimentFilter = 'ALL' | Sentiment;

const SENTIMENT_CHIPS: { key: SentimentFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'POSITIVE', label: 'Bullish' },
  { key: 'NEGATIVE', label: 'Bearish' },
  { key: 'NEUTRAL', label: 'Neutral' },
];

export function NewsTab() {
  const news = useMarketStore((s) => s.news);
  const setSelected = useMarketStore((s) => s.setSelected);
  const connected = useMarketStore((s) => s.connected);

  const [query, setQuery] = useState('');
  const [sentiment, setSentiment] = useState<SentimentFilter>('ALL');
  const [companyOnly, setCompanyOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return news.filter((item) => {
      if (sentiment !== 'ALL' && item.sentiment !== sentiment) return false;
      if (companyOnly && item.symbols.length === 0) return false;
      if (q) {
        const hay = `${item.headline} ${item.body} ${item.symbols.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [news, query, sentiment, companyOnly]);

  const counts = useMemo(
    () => ({
      positive: news.filter((n) => n.sentiment === 'POSITIVE').length,
      negative: news.filter((n) => n.sentiment === 'NEGATIVE').length,
    }),
    [news]
  );

  // Client-side CSV of the currently filtered feed (same rows the user sees).
  const exportCsv = useCallback(() => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = 'publishedAt,source,sentiment,impact,symbols,headline,body';
    const rows = filtered.map((n) =>
      [
        n.publishedAt,
        esc(n.source),
        n.sentiment,
        n.impact,
        esc(n.symbols.join(' ')),
        esc(n.headline),
        esc(n.body),
      ].join(',')
    );
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');
    const blob = new Blob([[header, ...rows].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luse_news_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

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
      {/* Filter bar */}
      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search headlines…"
              aria-label="Search news headlines"
              className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-7 pr-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setCompanyOnly((v) => !v)}
            aria-pressed={companyOnly}
            title="Only show headlines tagged to specific companies (hide macro)"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
              companyOnly
                ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300'
            }`}
            aria-label="Company news only"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title={`Export ${filtered.length} filtered headlines as CSV`}
            aria-label={`Export ${filtered.length} filtered news headlines as CSV`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-500 transition-colors hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-zinc-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sentiment filter">
          {SENTIMENT_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSentiment(c.key)}
              aria-pressed={sentiment === c.key}
              className={`h-6 rounded-md border px-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                sentiment === c.key
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {c.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-600" aria-live="polite">
            {filtered.length}/{news.length}
            {counts.negative > 0 && counts.positive > 0 && (
              <span className="ml-1.5" title={`${counts.positive} bullish · ${counts.negative} bearish`}>
                <span className="text-emerald-500">{counts.positive}▲</span>{' '}
                <span className="text-rose-500">{counts.negative}▼</span>
              </span>
            )}
          </span>
        </div>
      </div>

      {connected && filtered.length > 0 && (
        <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-zinc-500">
          <Radio className="h-3 w-3 animate-pulse text-orange-500" aria-hidden="true" />
          Live feed — new headlines appear automatically
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 py-8 text-zinc-600">
          <Newspaper className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs">No headlines match your filters.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSentiment('ALL');
              setCompanyOnly(false);
            }}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-orange-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
          >
            Clear filters
          </button>
        </div>
      ) : (
        filtered.map((item, idx) => (
          <NewsCard
            key={item.id}
            item={item}
            fresh={idx === 0 && query === '' && sentiment === 'ALL'}
            onSelect={setSelected}
          />
        ))
      )}
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
      className="news-card rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-700"
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
