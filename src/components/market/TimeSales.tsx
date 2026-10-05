'use client';

/**
 * Time & Sales — live trade tape for the selected counter.
 * Prints are synthesized client-side from engine tick deltas (cumulative
 * volume → per-tick traded size, tick direction → aggressor side), so the
 * tape streams in real time without extra engine traffic.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, ReceiptText } from 'lucide-react';
import { useMarketStore } from '@/lib/market/store';
import { fmtK, fmtNum, fmtTimeSec } from '@/lib/market/format';

export function TimeSales({ symbol }: { symbol: string }) {
  const prints = useMarketStore((s) => s.trades[symbol]);
  const connected = useMarketStore((s) => s.connected);

  const { buys, sells } = useMemo(() => {
    let buys = 0;
    let sells = 0;
    for (const p of prints ?? []) {
      if (p.side === 'buy') buys++;
      else sells++;
    }
    return { buys, sells };
  }, [prints]);

  return (
    <section
      aria-label={`Time and sales for ${symbol}`}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <ReceiptText className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Time &amp; Sales
        </p>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] tabular-nums">
          <span className="inline-flex items-center gap-0.5 text-emerald-400">
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            {buys}
          </span>
          <span className="inline-flex items-center gap-0.5 text-rose-400">
            <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
            {sells}
          </span>
          {connected && (
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
            </span>
          )}
        </span>
      </div>

      {prints && prints.length > 0 ? (
        <div className="luse-scroll max-h-56 overflow-y-auto" role="log" aria-live="off">
          <table className="w-full font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-wider text-zinc-600">
                <th scope="col" className="py-1 font-medium">Time</th>
                <th scope="col" className="py-1 font-medium">Side</th>
                <th scope="col" className="py-1 text-right font-medium">Price</th>
                <th scope="col" className="py-1 text-right font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {prints.map((p) => (
                <motion.tr
                  key={`${p.t}-${p.size}`}
                  initial={{ opacity: 0, backgroundColor: p.side === 'buy' ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)' }}
                  animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="border-t border-zinc-800/50"
                >
                  <td className="py-1 text-zinc-500">{fmtTimeSec(p.t)}</td>
                  <td className="py-1">
                    <span
                      className={`inline-block rounded px-1 text-[9px] font-bold tracking-wider ${
                        p.side === 'buy'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {p.side === 'buy' ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  <td
                    className={`py-1 text-right ${p.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {fmtK(p.price)}
                  </td>
                  <td className="py-1 text-right text-zinc-300">{fmtNum(p.size)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-3 text-center text-[11px] text-zinc-600">
          Waiting for the first trade print…
        </p>
      )}
    </section>
  );
}
