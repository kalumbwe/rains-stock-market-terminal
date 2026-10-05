'use client';

/**
 * Theme picker — header dropdown over the three terminal skins
 * (Dark / Daylight / OLED). Hydration-safe mounted detection via
 * useSyncExternalStore so the trigger renders identical SSR markup while
 * next-themes resolves the stored theme client-side.
 */

import { Moon, MonitorSmartphone, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const emptySubscribe = () => () => {};

const OPTIONS = [
  { value: 'dark', label: 'Dark', hint: 'Classic terminal', icon: Moon },
  { value: 'light', label: 'Daylight', hint: 'Bright office', icon: Sun },
  { value: 'oled', label: 'OLED', hint: 'Pure black', icon: MonitorSmartphone },
] as const;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const active = mounted && resolvedTheme ? resolvedTheme : 'dark';
  const ActiveIcon =
    OPTIONS.find((o) => o.value === active)?.icon ?? Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Pick theme"
        title="Pick theme — Dark / Daylight / OLED"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-orange-500/40 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
      >
        <ActiveIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 border-zinc-800 bg-zinc-950">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500">
          Theme
        </DropdownMenuLabel>
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setTheme(o.value)}
            aria-pressed={active === o.value}
            className={`gap-2.5 ${active === o.value ? 'text-orange-400' : 'text-zinc-300'}`}
          >
            <o.icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="flex-1 text-xs font-medium">{o.label}</span>
            <span className="text-[10px] text-zinc-500">{o.hint}</span>
            {active === o.value && (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
