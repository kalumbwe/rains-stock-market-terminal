'use client';

/**
 * Alerts tab — create price alerts (symbol / ABOVE / BELOW / target),
 * list with active vs triggered status, delete. State comes from the
 * single useAlertEngine instance owned by the terminal root.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  Target,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDateTime, fmtK } from '@/lib/market/format';
import { useMarketStore } from '@/lib/market/store';
import type { AlertCondition, PriceAlert } from '@/lib/market/types';

interface AlertsTabProps {
  alerts: PriceAlert[];
  loading: boolean;
  error: boolean;
  /** Desktop-notification opt-in state + toggle (wired by the terminal root). */
  notifyEnabled?: boolean;
  onToggleNotifications?: () => void;
  onCreate: (args: {
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
  }) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}

export function AlertsTab({
  alerts,
  loading,
  error,
  notifyEnabled = false,
  onToggleNotifications,
  onCreate,
  onDelete,
}: AlertsTabProps) {
  const symbols = useSymbolOptions();
  const [symbol, setSymbol] = useState<string>('');
  const [condition, setCondition] = useState<AlertCondition>('ABOVE');
  const [target, setTarget] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Presets operate on the form's symbol, falling back to the terminal selection.
  const terminalSelected = useMarketStore((s) => s.selectedSymbol);
  const stocks = useMarketStore((s) => s.stocks);
  const effectiveSymbol = symbol || terminalSelected || symbols[0] || '';
  const quote = effectiveSymbol ? stocks[effectiveSymbol] : undefined;

  const applyPreset = (cond: AlertCondition, price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setSymbol(effectiveSymbol);
    setCondition(cond);
    setTarget((Math.round(price * 100) / 100).toFixed(2));
  };

  const active = alerts.filter((a) => a.active);
  const triggered = alerts.filter((a) => !a.active && a.triggeredAt);

  const submit = async () => {
    const targetPrice = parseFloat(target);
    if (!symbol || !Number.isFinite(targetPrice) || targetPrice <= 0) return;
    setSubmitting(true);
    const ok = await onCreate({ symbol, condition, targetPrice });
    setSubmitting(false);
    if (ok) {
      setTarget('');
      setSymbol('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Create form */}
      <section
        aria-label="Create price alert"
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
      >
        <div className="mb-2 flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            New Price Alert
          </p>
          {onToggleNotifications && (
            <button
              type="button"
              onClick={onToggleNotifications}
              aria-pressed={notifyEnabled}
              title={notifyEnabled ? 'Desktop notifications are on' : 'Enable desktop notifications'}
              className={`ml-auto flex h-6 items-center gap-1 rounded-full border px-2 text-[9px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                notifyEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {notifyEnabled ? (
                <BellRing className="h-3 w-3" aria-hidden="true" />
              ) : (
                <BellOff className="h-3 w-3" aria-hidden="true" />
              )}
              {notifyEnabled ? 'Notify on' : 'Notify off'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger
              aria-label="Alert symbol"
              className="h-10 border-zinc-800 bg-zinc-950 text-xs text-zinc-100 data-[placeholder]:text-zinc-500"
            >
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
              {symbols.map((s) => (
                <SelectItem key={s} value={s} className="font-mono text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={condition}
            onValueChange={(v) => setCondition(v as AlertCondition)}
          >
            <SelectTrigger
              aria-label="Alert condition"
              className="h-10 border-zinc-800 bg-zinc-950 text-xs text-zinc-100"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
              <SelectItem value="ABOVE" className="text-xs">
                ▲ Crosses above
              </SelectItem>
              <SelectItem value="BELOW" className="text-xs">
                ▼ Crosses below
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target price (K)"
            aria-label="Target price in kwacha"
            className="h-10 flex-1 border-zinc-800 bg-zinc-950 font-mono text-sm tabular-nums text-zinc-100 placeholder:font-sans placeholder:text-zinc-600"
          />
          <Button
            onClick={() => void submit()}
            disabled={submitting || !symbol || !target}
            className="h-10 bg-orange-500 px-4 font-semibold text-zinc-950 hover:bg-orange-400 focus-visible:ring-orange-500/50"
            aria-label="Create alert"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              'Set Alert'
            )}
          </Button>
        </div>

        {/* Quick presets — fill target from the live quote */}
        <div className="mt-2.5 border-t border-zinc-800/70 pt-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Target className="h-3 w-3 text-zinc-500" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Quick presets
            </p>
            {effectiveSymbol && quote ? (
              <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">
                {effectiveSymbol} @ {fmtK(quote.price)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-0.5" role="group" aria-label="Target price presets">
            {([1, 5, 10] as const).map((p) => (
              <button
                key={`up-${p}`}
                type="button"
                disabled={!quote}
                onClick={() => quote && applyPreset('ABOVE', quote.price * (1 + p / 100))}
                className="flex h-6 items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1 font-mono text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-40"
                aria-label={`Set target ${p}% above live price`}
              >
                +{p}%
              </button>
            ))}
            {([1, 5, 10] as const).map((p) => (
              <button
                key={`down-${p}`}
                type="button"
                disabled={!quote}
                onClick={() => quote && applyPreset('BELOW', quote.price * (1 - p / 100))}
                className="flex h-6 items-center rounded-md border border-rose-500/25 bg-rose-500/10 px-1 font-mono text-[10px] font-semibold text-rose-400 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-40"
                aria-label={`Set target ${p}% below live price`}
              >
                −{p}%
              </button>
            ))}
            <span aria-hidden="true" className="mx-px h-6 w-px bg-zinc-800" />
            <button
              type="button"
              disabled={!quote}
              onClick={() => quote && applyPreset('ABOVE', quote.dayHigh)}
              className="flex h-6 items-center rounded-md border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Set target at day high"
            >
              Day Hi
            </button>
            <button
              type="button"
              disabled={!quote}
              onClick={() => quote && applyPreset('BELOW', quote.dayLow)}
              className="flex h-6 items-center rounded-md border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Set target at day low"
            >
              Day Lo
            </button>
          </div>
        </div>
      </section>

      {/* Lists */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : error && alerts.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">
          Alerts unavailable — check your connection.
        </p>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 py-8 text-zinc-500">
          <BellRing className="h-6 w-6" aria-hidden="true" />
          <p className="text-sm">No alerts yet — set one above.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <AlertGroup
              title={`Active (${active.length})`}
              items={active}
              onDelete={onDelete}
            />
          )}
          {triggered.length > 0 && (
            <AlertGroup
              title={`Triggered (${triggered.length})`}
              items={triggered}
              onDelete={onDelete}
            />
          )}
        </>
      )}
    </div>
  );
}

function AlertGroup({
  title,
  items,
  onDelete,
}: {
  title: string;
  items: PriceAlert[];
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </p>
      {items.map((a) => (
        <motion.div
          key={a.id}
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
        >
          {a.condition === 'ABOVE' ? (
            <ArrowUp className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-semibold text-zinc-100">
              {a.symbol}{' '}
              <span className="font-normal text-zinc-500">
                {a.condition === 'ABOVE' ? 'above' : 'below'}
              </span>{' '}
              <span className="font-mono tabular-nums text-orange-400">
                {fmtK(a.targetPrice)}
              </span>
            </p>
            {a.active ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-amber-500">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
                Watching live ticks
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Triggered {a.triggeredAt ? fmtDateTime(a.triggeredAt) : ''}
              </p>
            )}
          </div>
          {a.active && (
            <Badge
              variant="outline"
              className="hidden h-5 border-amber-500/40 bg-amber-500/10 text-[9px] font-bold tracking-wider text-amber-500 sm:inline-flex"
            >
              ACTIVE
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void onDelete(a.id)}
            aria-label={`Delete ${a.symbol} alert`}
            className="h-9 w-9 shrink-0 text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400 focus-visible:ring-rose-500/50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </motion.div>
      ))}
    </section>
  );
}

/** Symbol options come from the live store (order preserved from snapshot). */
function useSymbolOptions(): string[] {
  return useMarketStore((s) => s.stockOrder);
}
