'use client';

/**
 * LuSE Pulse — global client market state (zustand).
 * Hydrated from the engine socket (`snapshot` / `tick` / `news`) and REST
 * bootstrap. Flash + per-symbol price ring-buffers power sparklines and
 * tick animations.
 */

import { create } from 'zustand';
import type {
  IndexPoint,
  IndexState,
  NewsItem,
  Quote,
  SessionInfo,
  Snapshot,
  TickPayload,
} from './types';

export type FlashDir = 'up' | 'down';

/** One synthesized trade print (Time & Sales), derived from tick deltas. */
export interface TradePrint {
  t: number; // epoch ms
  price: number;
  size: number; // shares traded since the previous tick
  side: 'buy' | 'sell';
}

const PRICE_BUFFER_SIZE = 50; // ring buffer of last tick prices per symbol
const USD_BUFFER_SIZE = 60; // ring buffer of USD/ZMW samples
const INDEX_HISTORY_CAP = 720; // ~30min of ticks at 1.5s
const TRADES_CAP = 40; // trade prints kept per symbol
const FLASH_MS = 600;

export interface MarketStore {
  connected: boolean;
  session: SessionInfo | null;
  usdRate: number | null;
  index: IndexState | null;
  /** Full quotes, keyed by symbol. Ticks merge into snapshot fields. */
  stocks: Record<string, Quote>;
  /** Stable insertion order from the snapshot (tape / lists). */
  stockOrder: string[];
  news: NewsItem[];
  selectedSymbol: string;
  /** Transient per-symbol flash direction, cleared 600ms after each tick. */
  flash: Record<string, FlashDir>;
  /** Ring buffer (cap 50) of live prices per symbol — sparkline source. */
  priceHistory: Record<string, number[]>;
  /** Ring buffer (cap 60) of USD/ZMW rate samples — header sparkline. */
  usdHistory: number[];
  /** Latest trade prints per symbol (Time & Sales), newest first. */
  trades: Record<string, TradePrint[]>;

  setConnected: (connected: boolean) => void;
  setSelected: (symbol: string) => void;
  applySnapshot: (snap: Snapshot) => void;
  applyTick: (tick: TickPayload) => void;
  setNews: (items: NewsItem[]) => void;
  prependNews: (item: NewsItem) => void;
  clearFlash: (symbol: string) => void;
}

/** Pending flash-clear timers, keyed by symbol. */
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleFlashClear(symbol: string) {
  const existing = flashTimers.get(symbol);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    flashTimers.delete(symbol);
    useMarketStore.getState().clearFlash(symbol);
  }, FLASH_MS);
  flashTimers.set(symbol, timer);
}

function pushPrice(buf: number[] | undefined, price: number): number[] {
  const next = buf ? [...buf, price] : [price];
  if (next.length > PRICE_BUFFER_SIZE) next.splice(0, next.length - PRICE_BUFFER_SIZE);
  return next;
}

function pushUsd(buf: number[], rate: number): number[] {
  const next = [...buf, rate];
  if (next.length > USD_BUFFER_SIZE) next.splice(0, next.length - USD_BUFFER_SIZE);
  return next;
}

function appendIndexHistory(history: IndexPoint[] | undefined, value: number): IndexPoint[] {
  const base = history ?? [];
  const next = [...base, { t: Date.now(), v: value }];
  if (next.length > INDEX_HISTORY_CAP) next.splice(0, next.length - INDEX_HISTORY_CAP);
  return next;
}

function prependTrade(buf: TradePrint[] | undefined, print: TradePrint): TradePrint[] {
  const next = [print, ...(buf ?? [])];
  if (next.length > TRADES_CAP) next.splice(TRADES_CAP);
  return next;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  connected: false,
  session: null,
  usdRate: null,
  index: null,
  stocks: {},
  stockOrder: [],
  news: [],
  selectedSymbol: 'ZANACO',
  flash: {},
  priceHistory: {},
  usdHistory: [],
  trades: {},

  setConnected: (connected) => set({ connected }),

  setSelected: (symbol) => {
    if (get().selectedSymbol !== symbol) set({ selectedSymbol: symbol });
  },

  applySnapshot: (snap) => {
    const stocks: Record<string, Quote> = {};
    const order: string[] = [];
    for (const q of snap.stocks) {
      stocks[q.symbol] = { ...q };
      order.push(q.symbol);
    }
    set((state) => {
      // Seed price buffers so sparklines have a baseline before ticks.
      const priceHistory = { ...state.priceHistory };
      for (const q of snap.stocks) {
        if (!priceHistory[q.symbol]) {
          priceHistory[q.symbol] = [q.prevClose, q.price];
        }
      }
      // Keep index history if we already have live points.
      const history =
        state.index?.history && state.index.history.length > 0
          ? state.index.history
          : snap.index.history ?? [];
      const usdHistory = state.usdHistory.length > 0
        ? state.usdHistory
        : pushUsd(state.usdHistory, snap.usdRate);
      return {
        session: snap.session,
        usdRate: snap.usdRate,
        index: { ...snap.index, history },
        stocks,
        stockOrder: order,
        priceHistory,
        usdHistory,
      };
    });
  },

  applyTick: (tick) => {
    set((state) => {
      const stocks = { ...state.stocks };
      const flash = { ...state.flash };
      const priceHistory = { ...state.priceHistory };
      const trades = { ...state.trades };

      for (const tq of tick.stocks) {
        const prev = stocks[tq.symbol];
        if (prev) {
          // Merge live fields, keep full snapshot fields (name, sector, marketCap…).
          stocks[tq.symbol] = {
            ...prev,
            price: tq.price,
            change: tq.change,
            changePct: tq.changePct,
            dayHigh: tq.dayHigh,
            dayLow: tq.dayLow,
            volume: tq.volume,
            valueTraded: tq.valueTraded,
            bid: tq.bid,
            ask: tq.ask,
            lastUpdate: tick.serverTime,
          };
        } else {
          // Tick before snapshot — synthesize a minimal quote.
          stocks[tq.symbol] = {
            symbol: tq.symbol,
            name: tq.symbol,
            sector: '',
            price: tq.price,
            prevClose: tq.price - tq.change,
            dayOpen: tq.price,
            dayHigh: tq.dayHigh,
            dayLow: tq.dayLow,
            change: tq.change,
            changePct: tq.changePct,
            volume: tq.volume,
            valueTraded: tq.valueTraded,
            bid: tq.bid,
            ask: tq.ask,
            marketCap: 0,
            lastUpdate: tick.serverTime,
          };
        }
        if (tq.dir === 1 || tq.dir === -1) {
          flash[tq.symbol] = tq.dir === 1 ? 'up' : 'down';
          scheduleFlashClear(tq.symbol);
        }
        priceHistory[tq.symbol] = pushPrice(priceHistory[tq.symbol], tq.price);

        // Time & Sales print: engine reports cumulative volume, so a positive
        // delta is shares traded this tick. Side from the tick direction
        // (fall back to price movement vs the previous quote).
        const volDelta = prev ? tq.volume - prev.volume : 0;
        if (volDelta > 0) {
          const side: TradePrint['side'] =
            tq.dir === -1
              ? 'sell'
              : tq.dir === 1
                ? 'buy'
                : prev && tq.price < prev.price
                  ? 'sell'
                  : 'buy';
          trades[tq.symbol] = prependTrade(trades[tq.symbol], {
            t: Date.now(),
            price: tq.price,
            size: volDelta,
            side,
          });
        }
      }

      return {
        usdRate: tick.usdRate,
        usdHistory: pushUsd(state.usdHistory, tick.usdRate),
        index: state.index
          ? {
              ...state.index,
              ...tick.index,
              history: appendIndexHistory(state.index.history, tick.index.value),
            }
          : { ...tick.index, history: [] },
        stocks,
        flash,
        priceHistory,
        trades,
      };
    });
  },

  setNews: (items) => set({ news: items }),

  prependNews: (item) =>
    set((state) => {
      if (state.news.some((n) => n.id === item.id)) return state;
      return { news: [item, ...state.news] };
    }),

  clearFlash: (symbol) =>
    set((state) => {
      if (!(symbol in state.flash)) return state;
      const flash = { ...state.flash };
      delete flash[symbol];
      return { flash };
    }),
}));

// Dev/debug handle — lets browser QA inspect live store state.
if (typeof window !== 'undefined') {
  (window as unknown as { __luseStore: typeof useMarketStore }).__luseStore = useMarketStore;
}
