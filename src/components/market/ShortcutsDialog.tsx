'use client';

/**
 * Keyboard-shortcuts help dialog — opened with the `?` key or by clicking
 * the kbd hints in the footer. Lists every global shortcut grouped by
 * purpose, in a compact two-column grid.
 */

import { useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutEntry {
  keys: string[];
  label: string;
}

const GROUPS: { title: string; items: ShortcutEntry[] }[] = [
  {
    title: 'Navigation',
    items: [
      { keys: ['/'], label: 'Focus symbol search' },
      { keys: ['↑', '↓'], label: 'Move selection' },
      { keys: ['J', 'K'], label: 'Move selection (vim style)' },
    ],
  },
  {
    title: 'Trading',
    items: [
      { keys: ['B'], label: 'Buy the selected counter' },
      { keys: ['S'], label: 'Sell the selected counter' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { keys: ['P'], label: 'Market screener & correlation' },
      { keys: ['C'], label: 'Compare counters' },
    ],
  },
  {
    title: 'General',
    items: [{ keys: ['?'], label: 'Toggle this help' }],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Allow closing with ? again while the dialog is open (Radix only handles Esc).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Keyboard className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="sr-only">
            List of global keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4 luse-scroll">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2"
                  >
                    <span className="text-xs text-zinc-300">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="flex h-6 min-w-6 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[11px] font-semibold text-zinc-200 shadow-[0_1px_0_rgba(0,0,0,0.6)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <p className="border-t border-zinc-800/70 pt-3 text-[11px] leading-relaxed text-zinc-500">
            Shortcuts are ignored while typing in inputs, selects or other dialogs. Press{' '}
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-300">
              ?
            </kbd>{' '}
            again to close.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
