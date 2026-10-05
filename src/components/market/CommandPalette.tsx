'use client';

/**
 * Command palette — one dialog to jump to any counter or run any terminal
 * action: open tabs (mobile), screener, compare, trade the selection,
 * toggle alert sound / desktop notifications, shortcuts help.
 * Opened with ⌘K / Ctrl+K (use-keyboard-shortcuts) or the header search chip.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Bell,
  CandlestickChart,
  GitCompareArrows,
  Keyboard,
  Newspaper,
  TableProperties,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useMarketStore } from '@/lib/market/store';
import { fmtIndex, fmtPct } from '@/lib/market/format';

export type PaletteTab = 'market' | 'terminal' | 'portfolio' | 'news' | 'alerts';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void;
  onOpenScreener: () => void;
  onOpenCompare: () => void;
  onOpenShortcuts: () => void;
  /** Mobile tab entries — only provided when tab navigation applies. */
  tabs?: { value: PaletteTab; label: string; icon: ReactNode }[];
  onNavigateTab: (tab: PaletteTab) => void;
  notifyEnabled: boolean;
  soundEnabled: boolean;
  onToggleNotifications: () => void;
  onToggleSound: () => void;
}

function changeColor(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-zinc-400';
}

export function CommandPalette({
  open,
  onOpenChange,
  onTrade,
  onOpenScreener,
  onOpenCompare,
  onOpenShortcuts,
  tabs,
  onNavigateTab,
  notifyEnabled,
  soundEnabled,
  onToggleNotifications,
  onToggleSound,
}: CommandPaletteProps) {
  const stockOrder = useMarketStore((s) => s.stockOrder);
  const stocks = useMarketStore((s) => s.stocks);
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);
  const setSelected = useMarketStore((s) => s.setSelected);

  // Stable ordered quote list for the "Counters" group.
  const quotes = useMemo(
    () => stockOrder.map((sym) => stocks[sym]).filter((q) => Boolean(q)),
    [stockOrder, stocks]
  );

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump to a counter or run a terminal command"
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="Search counters or commands…" />
      <CommandList className="luse-scroll">
        <CommandEmpty>No matching counter or command.</CommandEmpty>

        <CommandGroup heading="Counters">
          {quotes.map((q) => (
            <CommandItem
              key={q.symbol}
              value={`${q.symbol} ${q.name} ${q.sector}`}
              onSelect={() => run(() => setSelected(q.symbol))}
              className="gap-2.5"
            >
              <span className="flex h-6 min-w-10 items-center justify-center rounded bg-zinc-800 px-1 font-mono text-[10px] font-bold tracking-wide text-zinc-300">
                {q.symbol}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{q.name}</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {fmtIndex(q.price)}
              </span>
              <span
                className={`w-14 text-right font-mono text-[11px] tabular-nums ${changeColor(q.changePct)}`}
              >
                {fmtPct(q.changePct)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Trading">
          <CommandItem
            value="buy selected counter"
            onSelect={() => run(() => onTrade(selectedSymbol, 'BUY'))}
            className="gap-2.5"
          >
            <ArrowRightLeft className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span className="text-xs">Buy {selectedSymbol}</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400">
              B
            </kbd>
          </CommandItem>
          <CommandItem
            value="sell selected counter"
            onSelect={() => run(() => onTrade(selectedSymbol, 'SELL'))}
            className="gap-2.5"
          >
            <ArrowRightLeft className="h-4 w-4 text-rose-400" aria-hidden="true" />
            <span className="text-xs">Sell {selectedSymbol}</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400">
              S
            </kbd>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Analysis">
          <CommandItem
            value="market screener correlation table"
            onSelect={() => run(onOpenScreener)}
            className="gap-2.5"
          >
            <TableProperties className="h-4 w-4 text-orange-400" aria-hidden="true" />
            <span className="text-xs">Market screener</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400">
              P
            </kbd>
          </CommandItem>
          <CommandItem
            value="compare counters performance"
            onSelect={() => run(onOpenCompare)}
            className="gap-2.5"
          >
            <GitCompareArrows className="h-4 w-4 text-orange-400" aria-hidden="true" />
            <span className="text-xs">Compare counters</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400">
              C
            </kbd>
          </CommandItem>
        </CommandGroup>

        {tabs && tabs.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {tabs.map((tab) => (
                <CommandItem
                  key={tab.value}
                  value={`go to ${tab.label}`}
                  onSelect={() => run(() => onNavigateTab(tab.value))}
                  className="gap-2.5"
                >
                  {tab.icon}
                  <span className="text-xs">{tab.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Preferences & help">
          <CommandItem
            value={notifyEnabled ? 'disable desktop notifications' : 'enable desktop notifications'}
            onSelect={() => run(onToggleNotifications)}
            className="gap-2.5"
          >
            <Bell className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span className="text-xs">
              Desktop notifications: {notifyEnabled ? 'turn off' : 'turn on'}
            </span>
          </CommandItem>
          <CommandItem
            value={soundEnabled ? 'disable alert sound' : 'enable alert sound'}
            onSelect={() => run(onToggleSound)}
            className="gap-2.5"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4 text-amber-400" aria-hidden="true" />
            )}
            <span className="text-xs">Alert sound: {soundEnabled ? 'turn off' : 'turn on'}</span>
          </CommandItem>
          <CommandItem
            value="keyboard shortcuts help"
            onSelect={() => run(onOpenShortcuts)}
            className="gap-2.5"
          >
            <Keyboard className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            <span className="text-xs">Keyboard shortcuts help</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-400">
              ?
            </kbd>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/* Tab icons shared with the mobile tab bar — keeps the palette visually
   consistent with the tabs it navigates to. */
export function paletteTabIcon(tab: PaletteTab): ReactNode {
  const cls = 'h-4 w-4 text-zinc-400';
  if (tab === 'market') return <BarChart3 className={cls} aria-hidden="true" />;
  if (tab === 'terminal') return <CandlestickChart className={cls} aria-hidden="true" />;
  if (tab === 'portfolio') return <Wallet className={cls} aria-hidden="true" />;
  if (tab === 'news') return <Newspaper className={cls} aria-hidden="true" />;
  return <Activity className={cls} aria-hidden="true" />;
}
