'use client';

/**
 * USD/ZMW converter — two-way linked inputs driven by the live engine rate.
 * A single amount+side source of truth derives the opposite side on render,
 * so the pair is always consistent (no sync effects). Quick chips set round
 * USD amounts; the header rate + sparkline reuse the store's USD buffer.
 */

import { useMemo, useState } from 'react';
import { ArrowDownUp, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMarketStore } from '@/lib/market/store';
import { fmtTime } from '@/lib/market/format';
import { Sparkline } from './Sparkline';

const QUICK_AMOUNTS = [1, 10, 100, 1000];

/** Format a converted value without trailing noise (≤2 dp, thousands separators). */
function fmtConv(v: number): string {
  return v.toLocaleString('en-ZM', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function parseNum(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function CurrencyConverter() {
  const usdRate = useMarketStore((s) => s.usdRate);
  const usdHistory = useMarketStore((s) => s.usdHistory);
  const stocks = useMarketStore((s) => s.stocks);
  const stockOrder = useMarketStore((s) => s.stockOrder);

  // Last engine quote update — doubles as the "rate as of" timestamp.
  const lastUpdate = useMemo(() => {
    for (const sym of stockOrder) {
      const q = stocks[sym];
      if (q?.lastUpdate) return q.lastUpdate;
    }
    return null;
  }, [stocks, stockOrder]);

  // Single source of truth: which side the user typed into + the raw string.
  const [amount, setAmount] = useState('10');
  const [side, setSide] = useState<'usd' | 'zmw'>('usd');

  const rate = usdRate ?? 0;
  const n = parseNum(amount);
  const hasAmount = Number.isFinite(n) && rate > 0;

  const usdValue = side === 'usd' ? amount : hasAmount ? fmtConv(n / rate) : '';
  const zmwValue = side === 'zmw' ? amount : hasAmount ? fmtConv(n * rate) : '';

  const usdUp = usdHistory.length >= 2 ? usdHistory[usdHistory.length - 1] >= usdHistory[0] : true;

  const applyQuick = (a: number) => {
    setSide('usd');
    setAmount(String(a));
  };

  return (
    <section
      aria-label="USD to ZMW converter"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          <ArrowDownUp className="h-3 w-3 text-orange-500" aria-hidden="true" />
          Currency · USD/ZMW
        </p>
        <span className="flex items-center gap-1.5" aria-label={`Live rate ${rate ? rate.toFixed(2) : 'loading'}`}>
          <DollarSign className="h-3 w-3 text-zinc-500" aria-hidden="true" />
          <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-200">
            {rate > 0 ? rate.toFixed(2) : '—'}
          </span>
          <Sparkline values={usdHistory} width={34} height={14} positive={usdUp} />
        </span>
      </div>

      <div className="space-y-1.5">
        {/* USD side */}
        <div
          className={`flex items-center gap-2 rounded-lg bg-zinc-950/70 px-2.5 py-2 ring-1 transition-colors focus-within:ring-orange-500/70 ${
            side === 'usd' ? 'ring-zinc-700' : 'ring-zinc-800/70'
          }`}
        >
          <span
            className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-zinc-400"
            aria-hidden="true"
          >
            USD $
          </span>
          <Input
            value={usdValue}
            onChange={(e) => {
              setSide('usd');
              setAmount(e.target.value);
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount in US dollars"
            className="h-6 border-0 bg-transparent p-0 text-right font-mono text-sm tabular-nums text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Swap glyph */}
        <div className="flex justify-center" aria-hidden="true">
          <ArrowDownUp className="h-3 w-3 rotate-90 text-zinc-600" />
        </div>

        {/* ZMW side */}
        <div
          className={`flex items-center gap-2 rounded-lg bg-zinc-950/70 px-2.5 py-2 ring-1 transition-colors focus-within:ring-orange-500/70 ${
            side === 'zmw' ? 'ring-zinc-700' : 'ring-zinc-800/70'
          }`}
        >
          <span
            className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-zinc-400"
            aria-hidden="true"
          >
            ZMW K
          </span>
          <Input
            value={zmwValue}
            onChange={(e) => {
              setSide('zmw');
              setAmount(e.target.value);
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount in Zambian kwacha"
            className="h-6 border-0 bg-transparent p-0 text-right font-mono text-sm tabular-nums text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Quick USD amounts */}
      <div className="mt-2 flex items-center gap-1.5" role="group" aria-label="Quick USD amounts">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => applyQuick(a)}
            className={`flex-1 rounded-md border px-1 py-1 font-mono text-[10px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
              side === 'usd' && amount === String(a)
                ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
            aria-pressed={side === 'usd' && amount === String(a)}
          >
            ${a.toLocaleString()}
          </button>
        ))}
      </div>

      <p className="mt-1.5 text-center text-[9px] italic text-zinc-600">
        Simulated engine rate{lastUpdate ? ` · updated ${fmtTime(lastUpdate)} CAT` : ''}
      </p>
    </section>
  );
}
