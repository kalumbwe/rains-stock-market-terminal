'use client';

/**
 * Sticky header: brand, LASI chip, Lusaka clock + session badge,
 * USD/ZMW chip and live/reconnecting indicator.
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { DollarSign, GitCompareArrows, RadioTower, Search, TableProperties } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketStore } from '@/lib/market/store';
import { fmtIndex, fmtPct } from '@/lib/market/format';
import { Sparkline } from './Sparkline';
import { ThemeToggle } from './ThemeToggle';

function changeColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

/* ---------- Session progress (Lusaka 09:30–15:30, Mon–Fri) ---------- */

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 15 * 60 + 30;

function fmtDur(totalMin: number): string {
  if (totalMin >= 1440) {
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    return `${d}d ${h}h`;
  }
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
  return `${totalMin}m`;
}

interface SessionProgress {
  open: boolean;
  pct: number;
  label: string;
}

function computeSessionProgress(): SessionProgress {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[wd] ?? 1;
  const minutes = hh * 60 + mm;
  const isWeekday = day >= 1 && day <= 5;

  if (isWeekday && minutes >= OPEN_MIN && minutes < CLOSE_MIN) {
    const pct = ((minutes - OPEN_MIN) / (CLOSE_MIN - OPEN_MIN)) * 100;
    return { open: true, pct, label: `Closes in ${fmtDur(CLOSE_MIN - minutes)}` };
  }

  // Minutes until next 09:30 open (weekday).
  let daysUntil: number;
  if (isWeekday && minutes < OPEN_MIN) {
    daysUntil = 0;
  } else if (day === 5) {
    daysUntil = 3; // Friday after close → Monday
  } else if (day === 6) {
    daysUntil = 2; // Saturday → Monday
  } else {
    daysUntil = 1; // Sunday or weekday after close
  }
  const totalMin = 24 * 60 - minutes + (daysUntil - 1) * 24 * 60 + OPEN_MIN;
  return { open: false, pct: 0, label: `Opens in ${fmtDur(totalMin)}` };
}

export function Header({
  onOpenScreener,
  onOpenCompare,
  onOpenPalette,
}: {
  onOpenScreener?: () => void;
  onOpenCompare?: () => void;
  onOpenPalette?: () => void;
}) {
  const connected = useMarketStore((s) => s.connected);
  const session = useMarketStore((s) => s.session);
  const index = useMarketStore((s) => s.index);
  const usdRate = useMarketStore((s) => s.usdRate);
  const usdHistory = useMarketStore((s) => s.usdHistory);

  // Lusaka clock + session countdown — client-only to avoid hydration mismatch.
  const [clock, setClock] = useState<{ short: string; long: string; mini: string } | null>(null);
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  useEffect(() => {
    const fmtLong = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lusaka',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const fmtShort = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lusaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const update = () => {
      const now = new Date();
      setClock({
        short: `${fmtShort.format(now)} CAT`,
        long: `${fmtLong.format(now)} CAT`,
        mini: fmtShort.format(now),
      });
      setProgress(computeSessionProgress());
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // LASI chip flash on index move (subscribed, no re-render storms).
  const [idxFlash, setIdxFlash] = useState<'up' | 'down' | null>(null);
  const prevIdxRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return useMarketStore.subscribe((s) => {
      const v = s.index?.value ?? null;
      const prev = prevIdxRef.current;
      prevIdxRef.current = v;
      if (v !== null && prev !== null && v !== prev) {
        setIdxFlash(v > prev ? 'up' : 'down');
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setIdxFlash(null), 450);
      }
    });
  }, []);

  // Live document title: index value + change while the tab is open.
  useEffect(() => {
    let last = 0;
    return useMarketStore.subscribe((s) => {
      const now = Date.now();
      if (now - last < 1000 || !s.index) return;
      last = now;
      document.title = `LASI ${fmtIndex(s.index.value)} ${fmtPct(s.index.changePct)} · Rains Stock Market`;
    });
  }, []);

  const isOpen = session?.status === 'OPEN';
  const usdUp = usdHistory.length >= 2 ? usdHistory[usdHistory.length - 1] >= usdHistory[0] : true;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
        {/* Brand — official flag mark + name; never compressed on narrow screens */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className="relative flex h-9 w-9 shrink-0 items-center justify-center"
            title="Rains Stock Market — official logo"
          >
            <Image
              src="/logo-zambia-flag.png"
              alt=""
              width={36}
              height={36}
              priority
              className="h-9 w-9 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </span>
          <div className="leading-tight">
            <h1 className="whitespace-nowrap text-sm font-bold tracking-wide text-zinc-100">
              Rains Stock Market
            </h1>
            <p className="hidden whitespace-nowrap text-[10px] uppercase tracking-widest text-zinc-500 xl:block">
              Zambia Market Terminal
            </p>
          </div>
        </div>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-zinc-800 md:block" />

        {/* LASI chip */}
        <div
          className={`hidden min-w-0 items-center gap-2 rounded-lg border bg-zinc-900/60 px-3 py-1.5 transition-colors duration-300 lg:flex ${
            idxFlash === 'up'
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : idxFlash === 'down'
                ? 'border-rose-500/50 bg-rose-500/10'
                : 'border-zinc-800'
          }`}
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

        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          {/* Command palette trigger (⌘K) */}
          {onOpenPalette ? (
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Open command palette"
              title="Command palette — jump to counters & actions (⌘K)"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-1.5 text-zinc-400 transition-colors hover:border-orange-500/40 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 sm:px-2.5"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <kbd className="hidden rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400 lg:inline">
                ⌘K
              </kbd>
            </button>
          ) : null}

          {/* Theme toggle (dark terminal / Daylight) */}
          <ThemeToggle />

          {/* Screener trigger */}
          {onOpenScreener ? (
            <button
              type="button"
              onClick={onOpenScreener}
              aria-label="Open market screener"
              title="Market screener — all counters, fundamentals & sorting"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 text-zinc-400 transition-colors hover:border-orange-500/40 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 sm:px-2.5"
            >
              <TableProperties className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden text-[10px] font-semibold uppercase tracking-wider xl:inline">
                Screener
              </span>
            </button>
          ) : null}

          {/* Compare trigger */}
          {onOpenCompare ? (
            <button
              type="button"
              onClick={onOpenCompare}
              aria-label="Compare counters"
              title="Compare counters — normalized performance, up to 4 symbols"
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 text-zinc-400 transition-colors hover:border-orange-500/40 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 sm:flex sm:px-2.5"
            >
              <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden text-[10px] font-semibold uppercase tracking-wider xl:inline">
                Compare
              </span>
            </button>
          ) : null}

          {/* USD/ZMW + trend sparkline */}
          <div
            className="hidden items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 xl:flex"
            aria-label="USD to ZMW rate"
          >
            <DollarSign className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              USD/ZMW
            </span>
            {usdRate !== null ? (
              <>
                <span className="font-mono text-xs font-semibold tabular-nums text-zinc-200">
                  {usdRate.toFixed(2)}
                </span>
                <Sparkline values={usdHistory} width={34} height={14} positive={usdUp} />
              </>
            ) : (
              <Skeleton className="h-3.5 w-10 bg-zinc-800" />
            )}
          </div>

          {/* Clock + session */}
          <div
            className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5"
            aria-label="Lusaka time and session status"
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-mono text-[11px] tabular-nums text-zinc-200 sm:text-sm">
                {clock ? (
                  <>
                    {/* Bare HH:mm on phones, full HH:mm:ss CAT from sm up */}
                    <span className="sm:hidden">{clock.mini}</span>
                    <span className="hidden sm:inline">{clock.long}</span>
                  </>
                ) : (
                  <Skeleton className="h-3.5 w-[72px] bg-zinc-800" />
                )}
              </span>
              {progress ? (
                <span
                  className={`hidden truncate text-[9px] font-medium tabular-nums min-[430px]:block ${
                    progress.open ? 'text-emerald-400/90' : 'text-zinc-500'
                  }`}
                  title={progress.open ? 'LuSE main session in progress' : 'LuSE main session closed'}
                >
                  {progress.label}
                </span>
              ) : (
                <Skeleton className="mt-0.5 hidden h-2 w-16 bg-zinc-800 min-[430px]:block" />
              )}
            </div>
            {session ? (
              <Badge
                className={`hidden h-5 border px-1.5 text-[10px] font-bold tracking-wider xl:inline-flex ${
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
              className={`hidden text-[10px] font-semibold uppercase tracking-wider xl:inline ${
                connected ? 'text-emerald-400' : 'text-amber-500'
              }`}
            >
              {connected ? 'LIVE' : 'SYNC…'}
            </span>
          </div>
        </div>
      </div>

      {/* Session progress strip — fills as the Lusaka session advances */}
      {progress?.open && (
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] bg-zinc-800/70"
          role="progressbar"
          aria-label="Trading session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.pct)}
          title={`Session ${Math.round(progress.pct)}% complete`}
        >
          <div
            className="h-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}
    </header>
  );
}
