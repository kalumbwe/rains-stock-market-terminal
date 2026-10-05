/**
 * Screener data — client-side fetch of GET /api/screener with a module-level
 * 5-minute promise cache (fundamentals change daily; live quote fields are
 * refreshed from the socket store wherever precision matters).
 *
 * Also hosts the deterministic dividend-calendar maths shared by the
 * screener dialog and the dividend calendar panel.
 */

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
  valueTraded: number;
  marketCap: number;
  peRatio: number;
  dividendYield: number;
  eps: number;
  beta: number;
  sharesOutstanding: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface ScreenerResponse {
  asOf: string;
  rows: ScreenerRow[];
}

const TTL_MS = 5 * 60 * 1000;
let cache: { data: ScreenerResponse; at: number } | null = null;
let inflight: Promise<ScreenerResponse> | null = null;

/** Fetch screener rows (cached for 5 min). Safe to call concurrently. */
export async function fetchScreener(): Promise<ScreenerResponse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/screener', { cache: 'no-store' });
      if (!res.ok) throw new Error(`screener ${res.status}`);
      const data = (await res.json()) as ScreenerResponse;
      cache = { data, at: Date.now() };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache (e.g. after an engine reconnect). */
export function invalidateScreener(): void {
  cache = null;
}

/* ------------------------------------------------------------------ */
/* Dividend calendar (deterministic simulation)                        */
/* ------------------------------------------------------------------ */

export interface DividendEvent {
  symbol: string;
  name: string;
  sector: string;
  /** Ex-dividend date, UTC midnight of the Lusaka calendar day. */
  exDate: number;
  daysAway: number;
  /** Estimated quarterly payout per share in ZMW (live price × yield / 4). */
  amountPerShare: number;
  yieldPct: number;
}

const QUARTER_MONTHS = [2, 5, 8, 11]; // Mar / Jun / Sep / Dec (0-based)

/** Stable small hash so each symbol keeps a consistent payment day + quarter. */
function hash(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Build the upcoming dividend calendar for yield-paying stocks, sorted by
 * ex-date. `priceOf` lets callers inject live prices; falls back to the
 * screener row price when absent.
 */
export function buildDividendCalendar(
  rows: ScreenerRow[],
  priceOf: (symbol: string) => number | undefined,
  limit = 8,
  horizonDays = 95,
): DividendEvent[] {
  const now = new Date();
  const lusakaToday = new Date(
    Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lusaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  ); // yyyy-mm-dd parsed as UTC midnight
  const todayMs = lusakaToday.getTime();

  const events: DividendEvent[] = [];
  for (const row of rows) {
    if (row.dividendYield <= 0) continue;
    const h = hash(row.symbol);
    const payDay = 3 + (h % 24); // 3rd–26th of the month
    const quarters = [
      QUARTER_MONTHS[h % 4],
      QUARTER_MONTHS[(h % 4 + 1) % 4],
      QUARTER_MONTHS[(h % 4 + 2) % 4],
      QUARTER_MONTHS[(h % 4 + 3) % 4],
    ];
    // Next occurrence across the rolling 4-quarter schedule.
    let best: number | null = null;
    for (let yOff = 0; yOff <= 1 && best === null; yOff++) {
      for (const m of quarters) {
        const d = new Date(Date.UTC(
          lusakaToday.getUTCFullYear() + yOff,
          m,
          payDay,
        ));
        if (d.getTime() >= todayMs) {
          best = d.getTime();
          break;
        }
      }
    }
    if (best === null) continue;
    const daysAway = Math.round((best - todayMs) / 86_400_000);
    if (daysAway > horizonDays) continue;
    const price = priceOf(row.symbol) ?? row.price;
    events.push({
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      exDate: best,
      daysAway,
      amountPerShare: Math.round(((price * row.dividendYield) / 100 / 4) * 100) / 100,
      yieldPct: row.dividendYield,
    });
  }
  events.sort((a, b) => a.exDate - b.exDate);
  return events.slice(0, limit);
}
