/**
 * LuSE Pulse — shared market types (bound to shared/api-contract.md v1).
 * Engine snapshot/quote shapes, candles, news, alerts, portfolio.
 */

/** Engine session info. status OPEN → live sim, CLOSED → after-hours sim. */
export interface SessionInfo {
  status: 'OPEN' | 'CLOSED';
  label: string;
  lusakaTime: string;
}

/** Intraday index point (LASI). */
export interface IndexPoint {
  t: number; // epoch ms
  v: number;
}

export interface IndexState {
  code: string;
  value: number;
  prevClose: number;
  change: number;
  changePct: number;
  /** Only present on snapshot; on ticks we append locally. */
  history?: IndexPoint[];
}

/** Full quote as delivered by snapshot / GET /api/stocks. */
export interface Quote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  prevClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  change: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  bid: number;
  ask: number;
  marketCap: number;
  lastUpdate: string;
}

/** Partial quote fields delivered on every socket tick. */
export interface TickQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  valueTraded: number;
  bid: number;
  ask: number;
  dir: 1 | -1 | 0;
}

export interface Snapshot {
  serverTime: string;
  session: SessionInfo;
  usdRate: number;
  index: IndexState;
  stocks: Quote[];
}

export interface TickPayload {
  serverTime: string;
  usdRate: number;
  index: Omit<IndexState, 'history'>;
  stocks: TickQuote[];
}

export type CandleInterval = '1m' | '5m' | '1h' | '1d';

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface CandlesResponse {
  symbol: string;
  interval: CandleInterval;
  candles: Candle[];
}

export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type Impact = 'HIGH' | 'MEDIUM' | 'LOW';

export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  source: string;
  symbols: string[];
  sentiment: Sentiment;
  impact: Impact;
  publishedAt: string;
}

export type AlertCondition = 'ABOVE' | 'BELOW';

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  targetPrice: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  createdAt: string;
}

export interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  realizedPnl: number;
  updatedAt: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  grossValue: number;
  fees: number;
  netValue: number;
  createdAt: string;
}

export interface PortfolioResponse {
  cash: number;
  initialCash: number;
  positions: Position[];
  trades: Trade[];
}

export interface TradeResponse {
  trade: Trade;
  cash: number;
  position: Position | null;
}

/** Static profile from GET /api/stocks/[symbol]. */
export interface StockProfile {
  symbol: string;
  name: string;
  sector: string;
  description: string;
  sharesOutstanding: number;
  peRatio: number;
  dividendYield: number;
  eps: number;
  beta: number;
  website: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface StockDetailResponse {
  quote: Quote;
  profile: StockProfile;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookResponse {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}
