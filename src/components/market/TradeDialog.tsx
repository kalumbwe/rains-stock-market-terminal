'use client';

/**
 * Trade dialog — BUY/SELL ticket with live price, quick sizes, fee
 * breakdown (commission max(0.15%, K5) + 0.05% levy) and submission
 * through the portfolio hook owned by the terminal root.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { fmtK, fmtMoney } from '@/lib/market/format';

export type TradeSide = 'BUY' | 'SELL';

const COMMISSION_PCT = 0.0015; // 0.15%
const MIN_COMMISSION = 5; // K5
const LEVY_PCT = 0.0005; // 0.05%

interface TradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  price: number | null;
  initialSide: TradeSide;
  /** Available cash for BUY affordability. */
  cash: number | null;
  /** Shares held for SELL. */
  positionQty: number | null;
  onSubmit: (args: { symbol: string; side: TradeSide; quantity: number }) => Promise<boolean>;
}

export function TradeDialog({
  open,
  onOpenChange,
  symbol,
  price,
  initialSide,
  cash,
  positionQty,
  onSubmit,
}: TradeDialogProps) {
  // Initializers run on remount — the parent gives this component a key per
  // dialog open (open/symbol/side), so the ticket always starts fresh.
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [qtyText, setQtyText] = useState(() =>
    initialSide === 'SELL' && positionQty ? String(Math.min(100, positionQty)) : '100'
  );
  const [submitting, setSubmitting] = useState(false);

  const qty = Math.floor(Number(qtyText) || 0);
  const livePrice = price ?? 0;

  const { gross, fees, net, maxAffordable } = useMemo(() => {
    const g = qty > 0 && livePrice > 0 ? qty * livePrice : 0;
    const commission = Math.max(g * COMMISSION_PCT, g > 0 ? MIN_COMMISSION : 0);
    const levy = g * LEVY_PCT;
    const f = g > 0 ? commission + levy : 0;
    const max =
      livePrice > 0 && cash !== null
        ? Math.floor(cash / (livePrice * (1 + COMMISSION_PCT + LEVY_PCT)))
        : null;
    return { gross: g, fees: f, net: side === 'BUY' ? g + f : g - f, maxAffordable: max };
  }, [qty, livePrice, side, cash]);

  const invalid =
    qty <= 0 ||
    livePrice <= 0 ||
    (side === 'BUY' && cash !== null && net > cash) ||
    (side === 'SELL' && positionQty !== null && qty > positionQty);

  const invalidReason =
    side === 'BUY'
      ? 'Order exceeds available cash.'
      : 'You do not hold enough shares.';

  const setQty = (n: number) => setQtyText(String(Math.max(0, Math.floor(n))));

  const quickSizes: { label: string; value: () => void }[] = [
    { label: '10', value: () => setQty(10) },
    { label: '100', value: () => setQty(100) },
    { label: '1K', value: () => setQty(1000) },
    {
      label: 'MAX',
      value: () =>
        side === 'BUY'
          ? setQty(maxAffordable ?? 0)
          : setQty(positionQty ?? 0),
    },
  ];

  const submit = async () => {
    if (invalid || qty <= 0) return;
    setSubmitting(true);
    const ok = await onSubmit({ symbol, side, quantity: qty });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-zinc-800 bg-zinc-950 p-0 text-zinc-100">
        <DialogHeader className="border-b border-zinc-800 px-5 pb-3 pt-5">
          <DialogTitle className="flex items-baseline justify-between">
            <span className="tracking-wide">{symbol}</span>
            <span className="font-mono text-lg font-bold tabular-nums text-orange-400">
              {price !== null ? fmtK(price) : '—'}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Paper trade at the live simulated price. Fees: 0.15% commission (min K5) + 0.05% levy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5 pt-4">
          {/* Side toggle */}
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900 p-1 ring-1 ring-zinc-800"
            role="tablist"
            aria-label="Order side"
          >
            {(['BUY', 'SELL'] as TradeSide[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={side === s}
                onClick={() => setSide(s)}
                className={`relative h-10 rounded-md text-sm font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 ${
                  side === s
                    ? s === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                      : 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/50'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Quantity */}
          <div>
            <label htmlFor="trade-qty" className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Quantity
            </label>
            <div className="mt-1 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty(Math.max(0, qty - 10))}
                aria-label="Decrease quantity by 10"
                className="h-11 w-11 shrink-0 border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Input
                id="trade-qty"
                type="number"
                inputMode="numeric"
                min={0}
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                aria-label="Quantity in shares"
                className="h-11 flex-1 border-zinc-800 bg-zinc-900 text-center font-mono text-lg font-bold tabular-nums text-zinc-100"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty(qty + 10)}
                aria-label="Increase quantity by 10"
                className="h-11 w-11 shrink-0 border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {quickSizes.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={q.value}
                  className="h-9 rounded-md border border-zinc-800 bg-zinc-900 font-mono text-xs font-semibold text-zinc-300 transition-colors hover:border-orange-500/50 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-right text-[11px] text-zinc-500">
              {side === 'BUY'
                ? cash !== null
                  ? `Cash available ${fmtMoney(cash)}`
                  : null
                : positionQty !== null
                  ? `You hold ${positionQty.toLocaleString()} shares`
                  : null}
            </p>
          </div>

          {/* Totals */}
          <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 font-mono text-sm tabular-nums">
            <Row label={`Gross (${qty.toLocaleString()} × ${fmtK(livePrice)})`} value={fmtMoney(gross)} />
            <Row label="Fees (comm + levy)" value={fmtMoney(fees)} muted />
            <Separator className="bg-zinc-800" />
            <Row
              label={side === 'BUY' ? 'Total cost' : 'Net proceeds'}
              value={fmtMoney(net)}
              strong
            />
          </div>

          {invalid && qty > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-md bg-rose-500/10 px-3 py-2 text-center text-xs font-medium text-rose-400 ring-1 ring-rose-500/30"
              role="alert"
            >
              {invalidReason}
            </motion.p>
          )}

          <Button
            onClick={() => void submit()}
            disabled={invalid || submitting}
            className={`h-12 w-full text-base font-bold tracking-wide text-zinc-950 ${
              side === 'BUY'
                ? 'bg-emerald-500 hover:bg-emerald-400 focus-visible:ring-emerald-500/50'
                : 'bg-rose-500 hover:bg-rose-400 focus-visible:ring-rose-500/50'
            }`}
            aria-label={`${side} ${qty} shares of ${symbol}`}
          >
            {submitting
              ? 'Placing order…'
              : `${side} ${qty > 0 ? qty.toLocaleString() : ''} ${symbol}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-xs text-zinc-500' : 'text-zinc-400'}>{label}</span>
      <span
        className={
          strong ? 'text-base font-bold text-zinc-100' : 'font-medium text-zinc-200'
        }
      >
        {value}
      </span>
    </div>
  );
}
