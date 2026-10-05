'use client';

/**
 * Market Screener — full-table view of all listed counters with live prices,
 * fundamentals, sector filters, column sorting and a 52-week position bar.
 * Row click selects the symbol in the terminal and closes the dialog.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Inbox,
  Loader2,
  Star,
  TableProperties,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import {
  buildDividendCalendar,
  fetchScreener,
  invalidateScreener,
  type ScreenerRow,
} from '@/lib/market/screener';
import { fmtBig, fmtIndex, fmtK, fmtNum, fmtPct } from '@/lib/market/format';
import { Sparkline } from './Sparkline';
import { CorrelationMatrix } from './CorrelationMatrix';

type SortKey =
  | 'symbol'
  | 'sector'
  | 'price'
  | 'changePct'
  | 'chg1w'
  | 'chg1m'
  | 'chg3m'
  | 'volume'
  | 'valueTraded'
  | 'marketCap'
  | 'peRatio'
  | 'dividendYield'
  | 'beta';

interface LiveOverlay {
  price: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  marketCap: number;
}

interface DisplayRow extends ScreenerRow {
  live: LiveOverlay | null;
}

const COLUMNS: {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  width?: string;
  numeric?: boolean;
}[] = [
  { key: 'symbol', label: 'Symbol', align: 'left' },
  { key: 'symbol', label: 'Trend', align: 'left', width: 'hidden sm:table-cell' },
  { key: 'sector', label: 'Sector', align: 'left', width: 'hidden xl:table-cell' },
  { key: 'price', label: 'Price', align: 'right', numeric: true },
  { key: 'changePct', label: 'Chg %', align: 'right', numeric: true },
  { key: 'chg1w', label: '1W', align: 'right', numeric: true, width: 'hidden xl:table-cell' },
  { key: 'chg1m', label: '1M', align: 'right', numeric: true, width: 'hidden lg:table-cell' },
  { key: 'chg3m', label: '3M', align: 'right', numeric: true, width: 'hidden xl:table-cell' },
  { key: 'volume', label: 'Volume', align: 'right', numeric: true, width: 'hidden lg:table-cell' },
  { key: 'valueTraded', label: 'Turnover', align: 'right', numeric: true, width: 'hidden lg:table-cell' },
  { key: 'marketCap', label: 'Mkt Cap', align: 'right', numeric: true, width: 'hidden md:table-cell' },
  { key: 'peRatio', label: 'P/E', align: 'right', numeric: true, width: 'hidden md:table-cell' },
  { key: 'dividendYield', label: 'Div Y', align: 'right', numeric: true, width: 'hidden sm:table-cell' },
  { key: 'beta', label: 'Beta', align: 'right', numeric: true, width: 'hidden xl:table-cell' },
  { key: 'symbol', label: '52W', align: 'left', width: 'hidden md:table-cell' },
];

function changeColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
  return dir === 'asc' ? (
    <ArrowUp className="h-3 w-3 text-orange-400" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-orange-400" aria-hidden="true" />
  );
}

/** Download `rows` as a CSV file (client-side blob, no backend round-trip). */
function downloadScreenerCsv(rows: DisplayRow[]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push('Rains Stock Market — Market Screener Export');
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    [
      'Symbol',
      'Name',
      'Sector',
      'Price (K)',
      'Prev Close (K)',
      'Chg %',
      '1W %',
      '1M %',
      '3M %',
      'Volume',
      'Turnover (K)',
      'Mkt Cap (K)',
      'P/E',
      'Div Yield %',
      'EPS',
      'Beta',
      '52W High (K)',
      '52W Low (K)',
    ].join(','),
  );
  for (const r of rows) {
    lines.push(
      [
        esc(r.symbol),
        esc(r.name),
        esc(r.sector),
        esc(r.live?.price ?? r.price),
        esc(r.prevClose),
        esc(r.live?.changePct ?? r.changePct),
        esc(r.chg1w),
        esc(r.chg1m),
        esc(r.chg3m),
        esc(r.live?.volume ?? r.volume),
        esc(r.live?.valueTraded ?? r.valueTraded),
        esc(r.live?.marketCap ?? r.marketCap),
        esc(r.peRatio > 0 ? r.peRatio.toFixed(1) : ''),
        esc(r.dividendYield > 0 ? r.dividendYield.toFixed(1) : ''),
        esc(r.eps),
        esc(r.beta),
        esc(r.fiftyTwoWeekHigh),
        esc(r.fiftyTwoWeekLow),
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `luse_screener_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ScreenerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState<string>('All');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Watchlist symbols — starred rows so users spot their counters instantly.
  const [watchlist, setWatchlist] = useState<Set<string>>(() => new Set());

  const load = async (force = false) => {
    setLoading(true);
    setError(false);
    try {
      if (force) invalidateScreener();
      const data = await fetchScreener();
      setRows(data.rows);
    } catch {
      setError(true);
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && rows === null && !loading) void load();
  }, [open]);

  // Refresh the watchlist star set whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/watchlist')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('watchlist'))))
      .then((data: { items?: { symbol: string }[] }) => {
        if (!cancelled) setWatchlist(new Set((data.items ?? []).map((i) => i.symbol)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sectors = useMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map((r) => r.sector))].sort();
  }, [rows]);

  // Live quote overlay so the table breathes with the tape.
  const stocks = useMarketStore((s) => s.stocks);
  const priceHistory = useMarketStore((s) => s.priceHistory);
  const setSelected = useMarketStore((s) => s.setSelected);

  const displayRows: DisplayRow[] = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    let list = rows.map((r) => {
      const lq = stocks[r.symbol];
      return lq
        ? {
            ...r,
            live: {
              price: lq.price,
              changePct: lq.changePct,
              volume: lq.volume,
              valueTraded: lq.valueTraded,
              marketCap: lq.marketCap,
            },
          }
        : { ...r, live: null };
    });
    if (sector !== 'All') list = list.filter((r) => r.sector === sector);
    if (q) {
      list = list.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      // Null-safe numeric sort — perf columns can be null (short history).
      const an = av === null || av === undefined ? null : (av as number);
      const bn = bv === null || bv === undefined ? null : (bv as number);
      if (an === null && bn === null) return 0;
      if (an === null) return 1; // nulls always sink to the bottom
      if (bn === null) return -1;
      return (an - bn) * dir;
    });
    return list;
  }, [rows, stocks, query, sector, sortKey, sortDir]);

  const topDividend = useMemo(
    () => (rows ? buildDividendCalendar(rows, () => undefined, 1) : []),
    [rows],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' || key === 'sector' ? 'asc' : 'desc');
    }
  };

  const pickSymbol = (symbol: string) => {
    setSelected(symbol);
    onOpenChange(false);
  };

  const [analysisTab, setAnalysisTab] = useState<'table' | 'correlation'>('table');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-6xl flex-col gap-0 border-zinc-800 bg-zinc-950 p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
            <TableProperties className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Market Screener
            <span className="ml-1 rounded bg-zinc-800 px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {displayRows.length} counters
            </span>
            <button
              type="button"
              onClick={() => downloadScreenerCsv(displayRows)}
              disabled={displayRows.length === 0}
              aria-label="Export screener as CSV"
              className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-orange-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-40"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              CSV
            </button>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Sortable table of all LuSE listed companies with live prices and fundamentals, plus a correlation matrix
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={analysisTab}
          onValueChange={(v) => setAnalysisTab(v as 'table' | 'correlation')}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-5 py-3">
          <TabsList className="h-8 shrink-0 bg-zinc-900/80">
            <TabsTrigger
              value="table"
              className="h-7 px-3 text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
            >
              Table
            </TabsTrigger>
            <TabsTrigger
              value="correlation"
              className="h-7 px-3 text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
            >
              Correlation
            </TabsTrigger>
          </TabsList>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbol, name or sector…"
            aria-label="Filter screener rows"
            className="h-8 w-full max-w-56 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
          />
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sector filter">
            {['All', ...sectors].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector(s)}
                aria-pressed={sector === s}
                className={`h-7 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                  sector === s
                    ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {topDividend[0] ? (
            <p className="ml-auto hidden font-mono text-[10px] tabular-nums text-zinc-600 lg:block">
              next ex-div: {topDividend[0].symbol} {topDividend[0].daysAway}d ·{' '}
              {fmtIndex(topDividend[0].yieldPct)}% yld
            </p>
          ) : null}
        </div>

        {/* Table tab */}
        <TabsContent value="table" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="luse-scroll min-h-0 flex-1 overflow-auto">
          {loading && rows === null ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full bg-zinc-800/60" />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
              <Inbox className="h-6 w-6" aria-hidden="true" />
              <p className="text-sm">Screener data unavailable — engine offline?</p>
              <button
                type="button"
                onClick={() => void load(true)}
                className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
              >
                <Loader2 className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-zinc-800">
                  {COLUMNS.map((c, i) => (
                    <th
                      key={`${c.key}-${i}`}
                      scope="col"
                      aria-sort={sortKey === c.key && i < COLUMNS.length - 1 ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2 font-semibold uppercase tracking-wider text-zinc-500 ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${c.width ?? ''}`}
                    >
                      {i === COLUMNS.length - 1 ? (
                        <span className="text-[10px]">52W</span>
                      ) : c.label === 'Trend' ? (
                        <span className="text-[10px]">Trend · 1m</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={`inline-flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                            sortKey === c.key ? 'text-orange-400' : ''
                          }`}
                        >
                          {c.label}
                          <SortIcon active={sortKey === c.key} dir={sortDir} />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const price = r.live?.price ?? r.price;
                  const pct = r.live?.changePct ?? r.changePct;
                  const vol = r.live?.volume ?? r.volume;
                  const turnover = r.live?.valueTraded ?? r.valueTraded;
                  const cap = r.live?.marketCap ?? r.marketCap;
                  const span = Math.max(0.0001, r.fiftyTwoWeekHigh - r.fiftyTwoWeekLow);
                  const posPct = Math.min(100, Math.max(0, ((price - r.fiftyTwoWeekLow) / span) * 100));
                  return (
                    <tr
                      key={r.symbol}
                      tabIndex={0}
                      onClick={() => pickSymbol(r.symbol)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') pickSymbol(r.symbol);
                      }}
                      className="cursor-pointer border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40 focus-visible:bg-zinc-800/40 focus-visible:outline-none"
                      aria-label={`${r.symbol} — open in terminal`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5 font-mono font-bold tracking-wide text-zinc-100">
                            {watchlist.has(r.symbol) && (
                              <Star
                                className="h-3 w-3 shrink-0 fill-orange-400 text-orange-400"
                                aria-hidden="true"
                              />
                            )}
                            {r.symbol}
                            {watchlist.has(r.symbol) && <span className="sr-only">(in watchlist)</span>}
                          </span>
                          <span className="max-w-44 truncate text-[10px] text-zinc-500 xl:hidden">{r.name}</span>
                          <span className="hidden text-[10px] text-zinc-500 xl:block">{r.name}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-zinc-400 xl:table-cell">{r.sector}</td>
                      <td className="hidden px-3 py-1.5 sm:table-cell">
                        <Sparkline
                          values={
                            (priceHistory[r.symbol]?.length ?? 0) > 5
                              ? priceHistory[r.symbol]
                              : r.sparkline
                          }
                          width={72}
                          height={22}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-zinc-100">
                        {fmtK(price)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${changeColor(pct)}`}>
                        {fmtPct(pct)}
                      </td>
                      <td className={`hidden px-3 py-2 text-right font-mono tabular-nums xl:table-cell ${r.chg1w === null ? 'text-zinc-600' : changeColor(r.chg1w)}`}>
                        {r.chg1w === null ? '—' : fmtPct(r.chg1w)}
                      </td>
                      <td className={`hidden px-3 py-2 text-right font-mono tabular-nums lg:table-cell ${r.chg1m === null ? 'text-zinc-600' : changeColor(r.chg1m)}`}>
                        {r.chg1m === null ? '—' : fmtPct(r.chg1m)}
                      </td>
                      <td className={`hidden px-3 py-2 text-right font-mono tabular-nums xl:table-cell ${r.chg3m === null ? 'text-zinc-600' : changeColor(r.chg3m)}`}>
                        {r.chg3m === null ? '—' : fmtPct(r.chg3m)}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-zinc-300 lg:table-cell">
                        {fmtNum(vol)}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-zinc-300 lg:table-cell">
                        {fmtBig(turnover)}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-zinc-300 md:table-cell">
                        {fmtBig(cap)}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-zinc-300 md:table-cell">
                        {r.peRatio > 0 ? r.peRatio.toFixed(1) : '—'}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-emerald-400/90 sm:table-cell">
                        {r.dividendYield > 0 ? `${r.dividendYield.toFixed(1)}%` : '—'}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono tabular-nums text-zinc-400 xl:table-cell">
                        {r.beta.toFixed(2)}
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <div
                          className="relative h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800"
                          aria-label={`52-week position ${Math.round(posPct)}%`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-600/60 to-orange-400/80"
                            style={{ width: `${posPct}%` }}
                          />
                          <div
                            className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-orange-300 ring-1 ring-zinc-950"
                            style={{ left: `calc(${posPct}% - 1px)` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-zinc-600">
                      No counters match your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
        </TabsContent>

        {/* Correlation matrix tab */}
        <TabsContent value="correlation" className="mt-0 min-h-0 flex-1 overflow-auto luse-scroll">
          <CorrelationMatrix onSelect={pickSymbol} />
        </TabsContent>
      </Tabs>

        <div className="flex shrink-0 items-center justify-between border-t border-zinc-800 px-5 py-2.5">
          <p className="text-[10px] text-zinc-600">
            Fundamentals from seeded profiles · prices live · click a row to open in terminal
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
