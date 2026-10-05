'use client';

/**
 * Left column — searchable stock list with All | Watchlist tabs,
 * per-row star toggle (optimistic watchlist add/remove), live price,
 * change badge and tick-price sparkline.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { GripVertical, Star, Search, Inbox } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { useMarketStore } from '@/lib/market/store';
import { fmtK, fmtPct } from '@/lib/market/format';
import type { WatchlistItem } from '@/lib/market/types';

function pctBadgeClass(pct: number): string {
  if (pct > 0) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (pct < 0) return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

export function StocksList() {
  const { toast } = useToast();
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const stocks = useMarketStore((s) => s.stocks);
  const priceHistory = useMarketStore((s) => s.priceHistory);
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);
  const setSelected = useMarketStore((s) => s.setSelected);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'watchlist'>('all');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [pendingStars, setPendingStars] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { items: WatchlistItem[] };
      if (mountedRef.current) setWatchlist(data.items ?? []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  const watchSymbols = useMemo(
    () => new Set(watchlist.map((w) => w.symbol)),
    [watchlist]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockOrder.filter((sym) => {
      const quote = stocks[sym];
      if (!quote) return false;
      if (tab === 'watchlist' && !watchSymbols.has(sym)) return false;
      if (!q) return true;
      return (
        quote.symbol.toLowerCase().includes(q) ||
        quote.name.toLowerCase().includes(q)
      );
    });
  }, [stockOrder, stocks, query, tab, watchSymbols]);

  const toggleStar = useCallback(
    async (symbol: string) => {
      const existing = watchlist.find((w) => w.symbol === symbol);
      // Optimistic update
      if (existing) {
        setWatchlist((prev) => prev.filter((w) => w.id !== existing.id));
      } else {
        const optimistic: WatchlistItem = {
          id: `tmp-${symbol}`,
          symbol,
          order: Number.MAX_SAFE_INTEGER,
          createdAt: new Date().toISOString(),
        };
        setWatchlist((prev) => [...prev, optimistic]);
      }
      setPendingStars((prev) => new Set(prev).add(symbol));
      try {
        if (existing) {
          const res = await fetch(`/api/watchlist/${existing.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('delete failed');
          toast({ title: `${symbol} removed from watchlist` });
        } else {
          const res = await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol }),
          });
          if (!res.ok) throw new Error('add failed');
          const data = (await res.json()) as { item: WatchlistItem };
          if (mountedRef.current) {
            setWatchlist((prev) =>
              prev.map((w) => (w.id === `tmp-${symbol}` ? data.item : w))
            );
          }
          toast({ title: `${symbol} added to watchlist` });
        }
      } catch {
        // Roll back on failure
        if (existing) {
          setWatchlist((prev) => [...prev, existing]);
        } else {
          setWatchlist((prev) => prev.filter((w) => w.symbol !== symbol));
        }
        toast({
          title: 'Watchlist update failed',
          description: 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setPendingStars((prev) => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
      }
    },
    [watchlist, toast]
  );

  // ── Watchlist drag-to-reorder ─────────────────────────────────────
  // Manual ordering only applies on the Watchlist tab with no active search —
  // otherwise rows follow the market/filtered order.
  const reorderMode = tab === 'watchlist' && query.trim() === '';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const displaySymbols = useMemo(() => {
    if (reorderMode) {
      return watchlist.map((w) => w.symbol).filter((sym) => stocks[sym]);
    }
    return filtered;
  }, [reorderMode, watchlist, stocks, filtered]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const current = watchlist.map((w) => w.symbol);
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      if (from < 0 || to < 0) return;

      const nextSymbols = arrayMove(current, from, to);
      const bySymbol = new Map(watchlist.map((w) => [w.symbol, w]));
      const reordered = nextSymbols
        .map((sym, idx) => {
          const item = bySymbol.get(sym);
          return item ? { ...item, order: idx } : null;
        })
        .filter((item): item is WatchlistItem => item !== null);

      const prev = watchlist;
      setWatchlist(reordered);
      void (async () => {
        try {
          const res = await fetch('/api/watchlist', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: nextSymbols }),
          });
          if (!res.ok) throw new Error('reorder failed');
          toast({ title: 'Watchlist order saved' });
        } catch {
          setWatchlist(prev);
          toast({
            title: 'Could not save order',
            description: 'Changes reverted — please try again.',
            variant: 'destructive',
          });
        }
      })();
    },
    [watchlist, toast]
  );

  const loading = stockOrder.length === 0;

  const renderRow = (sym: string, handle?: ReactNode) => {
    const q = stocks[sym];
    if (!q) return null;
    const starred = watchSymbols.has(sym);
    const active = selectedSymbol === sym;
    const spark = priceHistory[sym] ?? [];
    return (
      <div
        key={sym}
        role="listitem"
        className={`group flex w-full cursor-pointer items-center gap-2 border-b border-zinc-800/60 px-2.5 py-2 transition-colors ${
          active
            ? 'bg-orange-500/10 ring-1 ring-inset ring-orange-500/30'
            : 'hover:bg-zinc-800/40'
        }`}
        onClick={() => setSelected(sym)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelected(sym);
          }
        }}
        tabIndex={0}
        aria-label={`${q.name}, ${fmtK(q.price)}, ${fmtPct(q.changePct)}`}
      >
        {handle}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleStar(sym);
          }}
          disabled={pendingStars.has(sym)}
          aria-label={starred ? `Remove ${sym} from watchlist` : `Add ${sym} to watchlist`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:opacity-50"
        >
          <Star
            className={`h-3.5 w-3.5 ${starred ? 'fill-orange-500 text-orange-500' : ''}`}
            aria-hidden="true"
          />
        </button>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold tracking-wide text-zinc-100">
            {q.symbol}
          </div>
          <p className="truncate text-[11px] text-zinc-500">{q.name}</p>
        </div>

        <Sparkline values={spark} width={44} height={20} />

        <div className="w-[72px] shrink-0 text-right leading-tight">
          <div className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
            {fmtK(q.price)}
          </div>
          <span
            className={`mt-0.5 inline-block rounded border px-1 py-px font-mono text-[10px] font-medium tabular-nums ${pctBadgeClass(q.changePct)}`}
          >
            {fmtPct(q.changePct)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Stock list"
      className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60"
    >
      <div className="space-y-2.5 border-b border-zinc-800 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or company…"
            aria-label="Search stocks"
            className="h-9 border-zinc-800 bg-zinc-950 pl-8 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-orange-500/50"
          />
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'all' | 'watchlist')}
          className="gap-0"
        >
          <TabsList className="h-8 w-full bg-zinc-950/80">
            <TabsTrigger
              value="all"
              className="h-7 flex-1 px-3 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="watchlist"
              className="h-7 flex-1 px-3 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
            >
              Watchlist
              <Star className="h-3 w-3" aria-hidden="true" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="luse-scroll min-h-0 flex-1 overflow-y-auto" role="list">
        {loading ? (
          <div className="space-y-1 p-2" aria-label="Loading stocks">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                <Skeleton className="h-4 w-4 bg-zinc-800" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-16 bg-zinc-800" />
                  <Skeleton className="h-3 w-28 bg-zinc-800/70" />
                </div>
                <Skeleton className="h-5 w-14 bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : displaySymbols.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-zinc-500">
            <Inbox className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">
              {tab === 'watchlist'
                ? 'Watchlist is empty — tap a star to add stocks.'
                : 'No stocks match your search.'}
            </p>
          </div>
        ) : reorderMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displaySymbols}
              strategy={verticalListSortingStrategy}
            >
              {displaySymbols.map((sym) => (
                <SortableRow key={sym} id={sym}>
                  {(handle) => renderRow(sym, handle)}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          displaySymbols.map((sym) => renderRow(sym))
        )}
      </div>
    </section>
  );
}

/**
 * dnd-kit sortable wrapper for watchlist rows. Renders no visible chrome of
 * its own — the drag handle node is passed to the row via render prop so it
 * slots into the row's flex layout. Pointer activation needs 6px of travel
 * so plain clicks still select the stock; keyboard reorder works via the
 * focusable handle (Space to lift, arrows to move).
 */
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Reorder ${id}`}
      aria-roledescription="Drag handle — press space to lift, arrows to move"
      className="-ml-1 flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800/60 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
        opacity: isDragging ? 0.92 : undefined,
        boxShadow: isDragging
          ? '0 12px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(249,115,22,0.35)'
          : undefined,
        borderRadius: isDragging ? 10 : undefined,
      }}
      className={isDragging ? 'relative bg-zinc-900' : 'relative'}
    >
      {children(handle)}
    </div>
  );
}
