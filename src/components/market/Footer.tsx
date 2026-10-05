'use client';

import Image from 'next/image';
import { Keyboard, ShieldAlert } from 'lucide-react';

/**
 * Sticky-to-bottom footer. Sits at the viewport bottom when the page is
 * short (mt-auto inside a min-h-screen flex column) and is pushed down
 * naturally when content overflows. The kbd hint row doubles as a button
 * that opens the keyboard-shortcuts help dialog.
 */
export function Footer({ onOpenShortcuts }: { onOpenShortcuts?: () => void }) {
  const hint = (
    <span
      className="hidden items-center gap-1.5 text-[10px] text-zinc-600 lg:flex"
      aria-label="Keyboard shortcuts — click for help"
    >
      <Keyboard className="h-3 w-3" aria-hidden="true" />
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">⌘K</kbd>
      palette
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">/</kbd>
      search
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">↑↓</kbd>
      navigate
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">B</kbd>
      buy
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">S</kbd>
      sell
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">P</kbd>
      screener
      <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">C</kbd>
      compare
      {onOpenShortcuts && (
        <>
          <kbd className="rounded border border-orange-500/40 bg-orange-500/10 px-1 font-mono text-[10px] font-semibold text-orange-400">
            ?
          </kbd>
          help
        </>
      )}
    </span>
  );

  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col items-start justify-between gap-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-zinc-500 sm:flex-row sm:items-center sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-zambia-flag.png"
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
            />
            <span className="font-semibold tracking-wide text-zinc-400">Rains Stock Market</span>
            <span aria-hidden="true" className="text-zinc-700">·</span>
            <span>Zambia Market Terminal</span>
          </div>
          {/* Keyboard shortcuts (desktop only) — click opens the help dialog */}
          {onOpenShortcuts ? (
            <button
              type="button"
              onClick={onOpenShortcuts}
              aria-label="Open keyboard shortcuts help"
              className="rounded-md px-1 py-0.5 transition-colors hover:bg-zinc-800/60 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
            >
              {hint}
            </button>
          ) : (
            hint
          )}
        </div>
        <p className="flex items-center gap-1.5 leading-snug">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
          <span>
            Simulated market data for demonstration only — not investment advice. Real
            LuSE sessions run 09:30–15:30 CAT.
          </span>
        </p>
      </div>
    </footer>
  );
}
