'use client';

/**
 * Global keyboard shortcuts for the trading terminal:
 *   /            focus stock search
 *   ↑ / ↓ (j/k)  move selection through the stock list
 *   B / S        open the trade dialog (buy / sell) for the selected symbol
 *   P            open the market screener
 * Ignores keystrokes while typing in inputs, textareas, selects, popovers
 * or dialogs.
 */

import { useEffect } from 'react';
import { useMarketStore } from '@/lib/market/store';

export function useKeyboardShortcuts(
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void,
  onScreener?: () => void
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]'))
      ) {
        return;
      }

      const store = useMarketStore.getState();
      const order = store.stockOrder;
      if (order.length === 0) return;
      const idx = Math.max(0, order.indexOf(store.selectedSymbol));

      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search stocks"]')?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        store.setSelected(order[(idx + 1) % order.length]);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        store.setSelected(order[(idx - 1 + order.length) % order.length]);
      } else if (e.key.toLowerCase() === 'b') {
        onTrade(store.selectedSymbol, 'BUY');
      } else if (e.key.toLowerCase() === 's') {
        onTrade(store.selectedSymbol, 'SELL');
      } else if (e.key.toLowerCase() === 'p' && onScreener) {
        e.preventDefault();
        onScreener();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTrade, onScreener]);
}
