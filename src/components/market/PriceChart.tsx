'use client';

/**
 * Center chart card — 1D intraday (engine 1m candles, orange area + volume
 * bars) and 1M/3M/1Y daily views as true OHLC candlesticks (wick + body
 * range bars) with a toggleable SMA20 overlay, adaptive candle geometry and
 * client-side CSV export. Refetches on range/symbol change; OHLC tooltip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, LineChart as LineChartIcon, ChartCandlestick } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { smaSeries } from '@/lib/market/indicators';
import { fmtK, fmtNum, fmtTime } from '@/lib/market/format';
import type { Candle, CandleInterval } from '@/lib/market/types';

type Range = '1D' | '1M' | '3M' | '1Y';

interface ChartPoint {
  t: number;
  label: string;
  close: number;
  o: number;
  h: number;
  l: number;
  v: number;
  up: boolean;
  /** Range-bar payloads for recharts candle rendering. */
  wick: [number, number];
  body: [number, number];
  sma20: number | null;
}

const RANGE_LIMITS: Record<Exclude<Range, '1D'>, number> = {
  '1M': 22,
  '3M': 66,
  '1Y': 252,
};

function timeLabel(t: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(t));
}

function dayLabel(t: number, withYear: boolean): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: '2-digit' } : {}),
  }).format(new Date(t));
}

interface TooltipPayloadItem {
  payload: ChartPoint;
}

function PriceTooltip({
  active,
  payload,
  isDaily,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  isDaily: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-4">
        <span className="font-semibold text-zinc-300">
          {isDaily ? p.label : `${timeLabel(p.t)} CAT`}
        </span>
        <span className="font-mono font-bold tabular-nums text-orange-400">
          {fmtK(p.close)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono tabular-nums text-zinc-400">
        <span>O {fmtK(p.o)}</span>
        <span>H {fmtK(p.h)}</span>
        <span>L {fmtK(p.l)}</span>
        <span>C {fmtK(p.close)}</span>
      </div>
      <div className="mt-1 border-t border-zinc-800 pt-1 font-mono tabular-nums text-zinc-500">
        Vol {fmtNum(p.v)}
      </div>
    </div>
  );
}

function VolumeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950/95 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-300">
      Vol {fmtNum(p.v)} · {timeLabel(p.t)} CAT
    </div>
  );
}

const UP_FILL = '#34d39999';
const DOWN_FILL = '#fb718599';
const AXIS_TICK = { fontSize: 10, fill: '#71717a' } as const;

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>('1D');
  const [showMa, setShowMa] = useState(true);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const aliveRef = useRef(true);

  const isDaily = range !== '1D';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const interval: CandleInterval = isDaily ? '1d' : '1m';
      const limit = isDaily ? RANGE_LIMITS[range] : 300;
      const res = await fetch(
        `/api/stocks/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`,
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
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [symbol, isDaily, range]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchData();
    return () => {
      aliveRef.current = false;
    };
  }, [fetchData]);

  const points: ChartPoint[] = useMemo(() => {
    if (!candles) return [];
    const closes = candles.map((c) => c.c);
    const ma = smaSeries(closes, 20);
    return candles.map((c, i) => ({
      t: c.t,
      label: isDaily ? dayLabel(c.t, range === '1Y') : timeLabel(c.t),
      close: c.c,
      o: c.o,
      h: c.h,
      l: c.l,
      v: c.v,
      up: c.c >= c.o,
      wick: [c.l, c.h] as [number, number],
      body: [Math.min(c.o, c.c), Math.max(c.o, c.c)] as [number, number],
      sma20: ma[i],
    }));
  }, [candles, isDaily, range]);

  // Candle geometry adapts to series density so 1Y never overlaps.
  const candleBody = points.length > 150 ? 2 : points.length > 60 ? 4 : 8;
  const candleWick = Math.max(1, candleBody - 2);

  /** Client-side CSV export of the currently displayed candles. */
  const exportCsv = useCallback(() => {
    if (points.length === 0) return;
    const header = 'date,open,high,low,close,volume';
    const rows = points.map(
      (p) =>
        `${new Date(p.t).toISOString()},${p.o},${p.h},${p.l},${p.close},${Math.round(p.v)}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${range.toLowerCase()}_candles.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [points, symbol, range]);

  const priceDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (points.length === 0) return ['auto', 'auto'];
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.l < min) min = p.l;
      if (p.h > max) max = p.h;
    }
    const pad = (max - min) * 0.08 || max * 0.002 || 1;
    return [min - pad, max + pad];
  }, [points]);

  return (
    <section
      aria-label={`${symbol} price chart`}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ChartCandlestick className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-zinc-200">Price Chart</h3>
          <span className="rounded bg-zinc-800 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {range === '1D' ? '1m candles' : 'OHLC candles'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isDaily && (
            <button
              type="button"
              onClick={() => setShowMa((v) => !v)}
              aria-pressed={showMa}
              aria-label="Toggle 20-period moving average overlay"
              className={`flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 ${
                showMa
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LineChartIcon className="h-3 w-3" aria-hidden="true" />
              MA20
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || error || points.length === 0}
            aria-label={`Export ${range} candles as CSV`}
            className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            CSV
          </button>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)} className="gap-0">
            <TabsList className="h-7 bg-zinc-950/80">
              {(['1D', '1M', '3M', '1Y'] as Range[]).map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className="h-6 min-w-9 px-2 font-mono text-[11px] data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
                >
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="p-3 pr-4 pt-4">
        {loading ? (
          <Skeleton className="h-[300px] w-full bg-zinc-800/60" />
        ) : error ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-zinc-500">
            <ChartCandlestick className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">Chart data unavailable right now.</p>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="text-xs font-medium text-orange-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
            >
              Retry
            </button>
          </div>
        ) : points.length < 2 ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-zinc-500">
            <ChartCandlestick className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">No candles yet for this range.</p>
          </div>
        ) : isDaily ? (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={0}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                interval="preserveStartEnd"
                minTickGap={28}
                tickLine={false}
                axisLine={{ stroke: '#3f3f46' }}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={priceDomain}
                tick={AXIS_TICK}
                width={58}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => Number(v).toFixed(1)}
              />
              <YAxis yAxisId="vol" hide domain={[0, (max: number) => max * 5 || 1]} />
              <Tooltip
                content={<PriceTooltip isDaily />}
                cursor={{ stroke: '#f97316', strokeOpacity: 0.3 }}
              />
              {/* Volume (behind price action) */}
              <Bar yAxisId="vol" dataKey="v" barSize={3} isAnimationActive={false}>
                {points.map((p, i) => (
                  <Cell key={i} fill={p.up ? '#34d39966' : '#fb718566'} />
                ))}
              </Bar>
              {/* OHLC candle: thin wick bar behind a wider body bar */}
              <Bar
                yAxisId="price"
                dataKey="wick"
                barSize={candleWick}
                isAnimationActive={false}
                fillOpacity={0.55}
              >
                {points.map((p, i) => (
                  <Cell key={i} fill={p.up ? '#34d399' : '#fb7185'} />
                ))}
              </Bar>
              <Bar
                yAxisId="price"
                dataKey="body"
                barSize={candleBody}
                isAnimationActive={false}
              >
                {points.map((p, i) => (
                  <Cell key={i} fill={p.up ? '#34d399' : '#fb7185'} />
                ))}
              </Bar>
              {showMa && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="sma20"
                  stroke="#fbbf24"
                  strokeWidth={1.4}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={236}>
              <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="intradayPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  interval="preserveStartEnd"
                  minTickGap={36}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                />
                <YAxis
                  orientation="right"
                  domain={priceDomain}
                  tick={AXIS_TICK}
                  width={58}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => Number(v).toFixed(1)}
                />
                <Tooltip
                  content={<PriceTooltip isDaily={false} />}
                  cursor={{ stroke: '#f97316', strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#f97316"
                  strokeWidth={1.8}
                  fill="url(#intradayPriceFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={64}>
              <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="label" hide />
                <YAxis hide domain={[0, (max: number) => max * 1.15 || 1]} />
                <Tooltip
                  content={<VolumeTooltip />}
                  cursor={{ fill: '#27272a55' }}
                />
                <Bar dataKey="v" barSize={6} radius={[1, 1, 0, 0]} isAnimationActive={false}>
                  {points.map((p, i) => (
                    <Cell key={i} fill={p.up ? UP_FILL : DOWN_FILL} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </section>
  );
}
