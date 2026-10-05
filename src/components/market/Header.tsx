'use client';

/**
 * Sticky header: brand, LASI chip, Lusaka clock + session badge,
 * USD/ZMW chip and live/reconnecting indicator.
 */

import { useEffect, useState } from 'react';
import { Activity, DollarSign, RadioTower } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import { fmtIndex, fmtPct } from '@/lib/market/format';

function changeColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

export function Header() {
  const connected = useMarketStore((s) => s.connected);
  const session = useMarketStore((s) => s.session);
  const index = useMarketStore((s) => s.index);
  const usdRate = useMarketStore((s) => s.usdRate);

  // Lusaka clock — client-only to avoid hydration mismatch.
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lusaka',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const update = () => setClock(`${fmt.format(new Date())} CAT`);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const isOpen = session?.status === 'OPEN';

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 ring-1 ring-orange-500/40"
            aria-hidden="true"
          >
            <Activity className="h-5 w-5 text-orange-500" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-bold tracking-wide text-zinc-100">
              LuSE Pulse
            </h1>
            <p className="truncate text-[10px] uppercase tracking-widest text-zinc-500">
              Zambia Market Terminal
            </p>
          </div>
        </div>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-zinc-800 md:block" />

        {/* LASI chip */}
        <div
          className="hidden min-w-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 md:flex"
          aria-label="LASI index"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-orange-500' : 'bg-zinc-600'}`}
            />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            LASI
          </span>
          {index ? (
            <>
              <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                {fmtIndex(index.value)}
              </span>
              <span
                className={`font-mono text-xs font-medium tabular-nums ${changeColor(index.changePct)}`}
              >
                {fmtPct(index.changePct)}
              </span>
            </>
          ) : (
            <Skeleton className="h-4 w-24 bg-zinc-800" />
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* USD/ZMW */}
          <div
            className="hidden items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 sm:flex"
            aria-label="USD to ZMW rate"
          >
            <DollarSign className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              USD/ZMW
            </span>
            {usdRate !== null ? (
              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-200">
                {usdRate.toFixed(2)}
              </span>
            ) : (
              <Skeleton className="h-3.5 w-10 bg-zinc-800" />
            )}
          </div>

          {/* Clock + session */}
          <div
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5"
            aria-label="Lusaka time and session status"
          >
            <span className="font-mono text-xs tabular-nums text-zinc-200 sm:text-sm">
              {clock ?? <Skeleton className="h-3.5 w-[72px] bg-zinc-800" />}
            </span>
            {session ? (
              <Badge
                className={`h-5 border px-1.5 text-[10px] font-bold tracking-wider ${
                  isOpen
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                {isOpen ? 'LIVE • SIM' : 'AFTER HOURS • SIM'}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-24 rounded-md bg-zinc-800" />
            )}
          </div>

          {/* Connection */}
          <div
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5"
            role="status"
            aria-live="polite"
            aria-label={connected ? 'Live data connected' : 'Reconnecting to market engine'}
          >
            <RadioTower
              className={`h-3.5 w-3.5 ${connected ? 'text-emerald-400' : 'animate-pulse text-amber-500'}`}
              aria-hidden="true"
            />
            <span
              className={`hidden text-[10px] font-semibold uppercase tracking-wider sm:inline ${
                connected ? 'text-emerald-400' : 'text-amber-500'
              }`}
            >
              {connected ? 'LIVE' : 'SYNC…'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
