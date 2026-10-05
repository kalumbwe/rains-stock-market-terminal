'use client';

import { Activity, ShieldAlert } from 'lucide-react';

/**
 * Sticky-to-bottom footer. Sits at the viewport bottom when the page is
 * short (mt-auto inside a min-h-screen flex column) and is pushed down
 * naturally when content overflows.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col items-start justify-between gap-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-zinc-500 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          <span className="font-semibold tracking-wide text-zinc-400">LuSE Pulse</span>
          <span aria-hidden="true" className="text-zinc-700">·</span>
          <span>Zambia Market Terminal</span>
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
