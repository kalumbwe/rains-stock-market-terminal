'use client';

/**
 * Theme toggle — flips the terminal between the canonical dark skin and
 * the Daylight remap (globals.css). Hydration-safe mounted detection via
 * useSyncExternalStore: the server snapshot renders the same markup as the
 * first client render, so next-themes can resolve the stored theme without
 * a mismatch warning.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isDark = mounted ? resolvedTheme !== 'light' : true;
  const label = mounted
    ? `Switch to ${isDark ? 'Daylight' : 'Dark'} theme`
    : 'Toggle theme';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-orange-500/40 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
