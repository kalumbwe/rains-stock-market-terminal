'use client';

/**
 * Paper-trading portfolio state — GET /api/portfolio, trade execution,
 * account reset. Live prices are merged from the market store by callers.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import type { PortfolioResponse, TradeResponse } from '@/lib/market/types';

export interface PortfolioState {
  portfolio: PortfolioResponse | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  submitTrade: (
    args: { symbol: string; side: 'BUY' | 'SELL'; quantity: number },
    priceHint: number | null
  ) => Promise<boolean>;
  resetAccount: () => Promise<boolean>;
}

export function usePortfolio(): PortfolioState {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      const data = (await res.json()) as PortfolioResponse;
      setPortfolio(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitTrade = useCallback(
    async (
      args: { symbol: string; side: 'BUY' | 'SELL'; quantity: number },
      priceHint: number | null
    ): Promise<boolean> => {
      try {
        const res = await fetch('/api/portfolio/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const data = (await res.json().catch(() => ({}))) as
          | TradeResponse
          | { error: string };

        if (!res.ok) {
          const err = data as { error?: string };
          const msg =
            err.error === 'insufficient-cash'
              ? 'Not enough cash for this order.'
              : err.error === 'insufficient-shares'
                ? 'You do not hold enough shares to sell.'
                : err.error === 'engine-unavailable'
                  ? 'Market engine offline — try again shortly.'
                  : 'Order rejected. Please review and retry.';
          toast({ title: 'Trade failed', description: msg, variant: 'destructive' });
          return false;
        }

        const ok = data as TradeResponse;
        const verb = args.side === 'BUY' ? 'Bought' : 'Sold';
        const px =
          ok.trade.price ?? priceHint ?? 0;
        toast({
          title: `✓ ${verb} ${args.quantity.toLocaleString()} ${args.symbol} @ K${px.toFixed(2)}`,
          description:
            args.side === 'BUY'
              ? `Total K${ok.trade.netValue.toFixed(2)} incl. fees · Cash left K${ok.cash.toFixed(2)}`
              : `Proceeds K${ok.trade.netValue.toFixed(2)} · Cash now K${ok.cash.toFixed(2)}`,
        });
        await refresh();
        return true;
      } catch {
        toast({
          title: 'Trade failed',
          description: 'Network error — could not reach the trading API.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [refresh]
  );

  const resetAccount = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/portfolio/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`reset ${res.status}`);
      toast({ title: 'Account reset', description: 'Paper account restored to K100,000 cash.' });
      await refresh();
      return true;
    } catch {
      toast({
        title: 'Reset failed',
        description: 'Could not reset the account. Try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [refresh]);

  return { portfolio, loading, error, refresh, submitTrade, resetAccount };
}
