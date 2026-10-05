'use client';

/**
 * Price alerts — CRUD against /api/alerts plus the tick-driven trigger
 * engine: subscribes to live prices in the market store and fires each
 * active alert exactly once (locally-tracked fired set), PATCHes the API
 * and refreshes the list.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { useMarketStore } from '@/lib/market/store';
import { fmtK } from '@/lib/market/format';
import type { AlertCondition, PriceAlert } from '@/lib/market/types';

export interface AlertsState {
  alerts: PriceAlert[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  createAlert: (args: {
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
  }) => Promise<boolean>;
  removeAlert: (id: string) => Promise<void>;
}

export function useAlertEngine(): AlertsState {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const alertsRef = useRef<PriceAlert[]>([]);
  const firedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts', { cache: 'no-store' });
      if (!res.ok) throw new Error(`alerts ${res.status}`);
      const data = (await res.json()) as { alerts: PriceAlert[] };
      setAlerts(data.alerts ?? []);
      alertsRef.current = data.alerts ?? [];
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

  // ── Trigger engine ────────────────────────────────────────────────
  useEffect(() => {
    let checking = false;
    const check = () => {
      if (checking) return;
      const { stocks } = useMarketStore.getState();
      const pending: PriceAlert[] = [];
      for (const a of alertsRef.current) {
        if (!a.active || firedRef.current.has(a.id)) continue;
        const q = stocks[a.symbol];
        if (!q || typeof q.price !== 'number') continue;
        const hit =
          (a.condition === 'ABOVE' && q.price >= a.targetPrice) ||
          (a.condition === 'BELOW' && q.price <= a.targetPrice);
        if (hit) pending.push(a);
      }
      if (pending.length === 0) return;
      checking = true;
      for (const a of pending) {
        firedRef.current.add(a.id);
        const dirWord = a.condition === 'ABOVE' ? 'crossed above' : 'crossed below';
        toast({
          title: `🔔 ${a.symbol} ${dirWord} ${fmtK(a.targetPrice)}`,
          description: `Live price ${fmtK(useMarketStore.getState().stocks[a.symbol]?.price)} triggered your ${a.condition.toLowerCase()} alert.`,
        });
        void fetch(`/api/alerts/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: true }),
        })
          .then(() => refresh())
          .catch(() => undefined);
      }
      checking = false;
    };

    const unsub = useMarketStore.subscribe(check);
    return unsub;
  }, [refresh]);

  const createAlert = useCallback(
    async (args: { symbol: string; condition: AlertCondition; targetPrice: number }) => {
      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        if (!res.ok) {
          toast({
            title: 'Alert not created',
            description: 'Check the symbol and target price, then retry.',
            variant: 'destructive',
          });
          return false;
        }
        toast({
          title: `Alert set — ${args.symbol} ${args.condition === 'ABOVE' ? '▲' : '▼'} ${fmtK(args.targetPrice)}`,
          description: 'We will fire a toast the moment it triggers.',
        });
        await refresh();
        return true;
      } catch {
        toast({
          title: 'Alert not created',
          description: 'Network error — try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [refresh]
  );

  const removeAlert = useCallback(
    async (id: string) => {
      // Optimistic removal
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      alertsRef.current = alertsRef.current.filter((a) => a.id !== id);
      try {
        const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete failed');
      } catch {
        toast({
          title: 'Could not delete alert',
          description: 'Re-syncing alerts.',
          variant: 'destructive',
        });
        await refresh();
      }
    },
    [refresh]
  );

  return { alerts, loading, error, refresh, createAlert, removeAlert };
}
