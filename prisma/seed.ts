/**
 * Seed script for the Zambia LuSE Market Terminal.
 * Run: bun prisma/seed.ts
 * - Stocks from shared/luse-stocks.json
 * - 252 trading days of daily OHLCV per stock (GBM walk that ends exactly at current price)
 * - Seeded market news
 * - Cash account (K100,000 paper money) + default watchlist
 */
import { PrismaClient } from "@prisma/client";
import config from "../shared/luse-stocks.json";

const db = new PrismaClient();

// ---------- deterministic RNG so seeds are reproducible ----------
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function gauss() {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function tradingDays(count: number): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  while (days.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}

function generateDailySeries(current: number, beta: number, days: number) {
  // Annualized vol derived from beta (higher beta -> more volatile)
  const annualVol = 0.18 + Math.abs(beta) * 0.14;
  const dailyVol = annualVol / Math.sqrt(252);
  // Walk backwards from current price to build history, then reverse.
  const closes: number[] = [current];
  for (let i = 1; i < days; i++) {
    const drift = -0.0002; // slight upward bias when reversed (older prices lower)
    const ret = drift + dailyVol * gauss();
    const prev = closes[closes.length - 1] / (1 + ret);
    closes.push(Math.max(prev, 0.05));
  }
  closes.reverse();
  // Force the last close to be exactly the current price
  const scale = current / closes[closes.length - 1];
  for (let i = Math.max(0, closes.length - 5); i < closes.length; i++) {
    closes[i] *= 1 + (scale - 1) * ((i - (closes.length - 5)) / 5);
  }
  closes[closes.length - 1] = current;

  const out: { date: Date; open: number; high: number; low: number; close: number; volume: number }[] = [];
  const baseVol = 20_000 + rand() * 180_000;
  for (let i = 0; i < closes.length; i++) {
    const close = Math.round(closes[i] * 100) / 100;
    const open = i === 0 ? Math.round(close * (1 - 0.004 * gauss()) * 100) / 100 : out[i - 1].close;
    const hi = Math.max(open, close) * (1 + Math.abs(gauss()) * dailyVol * 0.7);
    const lo = Math.min(open, close) * (1 - Math.abs(gauss()) * dailyVol * 0.7);
    const volume = Math.round(baseVol * (0.4 + rand() * 1.6) * (1 + Math.abs(close / (out[i - 1]?.close ?? close) - 1) * 40));
    out.push({
      date: new Date(0),
      open: Math.round(open * 100) / 100,
      high: Math.round(hi * 100) / 100,
      low: Math.round(Math.max(lo, 0.05) * 100) / 100,
      close,
      volume: Math.max(1000, volume),
    });
  }
  return out;
}

const NEWS_TEMPLATES: { sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL"; impact: "HIGH" | "MEDIUM" | "LOW"; make: (name: string, sym: string) => { headline: string; body: string } }[] = [
  { sentiment: "POSITIVE", impact: "HIGH", make: (n) => ({ headline: `${n} posts strong H1 profit, board signals interim dividend`, body: "Robust topline growth and disciplined cost control lifted earnings well above market consensus. Analysts flagged balance-sheet strength as supportive of a generous interim payout." }) },
  { sentiment: "POSITIVE", impact: "MEDIUM", make: (n) => ({ headline: `${n} wins new contract expansion in Copperbelt region`, body: "Management confirmed a multi-year commercial agreement expected to add meaningful revenue from next quarter, reinforcing the company's regional growth strategy." }) },
  { sentiment: "POSITIVE", impact: "MEDIUM", make: (n) => ({ headline: `Broker upgrades ${n} to OVERBUY on attractive valuation`, body: "A Lusaka-based research desk raised its rating citing improving operating leverage, resilient demand and an attractive dividend yield relative to peers." }) },
  { sentiment: "NEGATIVE", impact: "HIGH", make: (n) => ({ headline: `${n} flags margin pressure as input costs surge`, body: "Rising imported input costs and a tighter kwacha squeezed margins in the period. Management said pricing actions and local sourcing should progressively restore margins." }) },
  { sentiment: "NEGATIVE", impact: "MEDIUM", make: (n) => ({ headline: `${n} volumes dip amid subdued consumer demand`, body: "Softer discretionary spending and elevated living costs weighed on unit volumes in the quarter, although management retained full-year guidance." }) },
  { sentiment: "NEUTRAL", impact: "MEDIUM", make: (n) => ({ headline: `${n} announces AGM date and board changes`, body: "The board recommended the election of two independent non-executive directors at the upcoming AGM and published the full annual report on the LuSE disclosures portal." }) },
  { sentiment: "POSITIVE", impact: "LOW", make: (n) => ({ headline: `${n} declares final dividend, payment date set`, body: "Shareholders approved a final dividend with the register closing later this month. Payment will be effected within 10 business days of the record date." }) },
];

const MACRO_NEWS: { headline: string; body: string; sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL"; impact: "HIGH" | "MEDIUM" | "LOW"; symbols: string }[] = [
  { headline: "Bank of Zambia holds policy rate at 9.0% as inflation cools to 8.9%", body: "The Monetary Policy Committee kept the policy rate unchanged, citing a slower rise in food prices and a stabilising kwacha. Governor noted that inflation expectations remain anchored within the 6-8% target band.", sentiment: "POSITIVE", impact: "HIGH", symbols: "ZANACO,SCBL" },
  { headline: "Copper steadies near $10,800/t on LME as smelter outage tightens supply", body: "Three-month copper held firm in London trade, underpinned by supply disruptions and resilient Chinese demand — a supportive backdrop for Zambia's mining-linked counters.", sentiment: "POSITIVE", impact: "HIGH", symbols: "ZCCM-IH" },
  { headline: "Zambia's 2026 national budget signals infrastructure push and debt discipline", body: "The Minister of Finance unveiled a K217.9 billion budget prioritising energy sector reform, road rehabilitation and agriculture subsidies, with a narrower fiscal deficit target of 3.1% of GDP.", sentiment: "NEUTRAL", impact: "MEDIUM", symbols: "CHIL,DCZM,CEC" },
  { headline: "ZESCO grid upgrade timeline confirmed; load-shedding hours to ease by Q3", body: "The power utility and independent producers agreed an import and generation schedule expected to cut load-shedding hours, easing cost pressure on mines and industrials.", sentiment: "POSITIVE", impact: "MEDIUM", symbols: "CEC,CECA" },
  { headline: "Kwacha firms against the dollar on improved forex inflows from mining receipts", body: "The kwacha appreciated on the interbank market as miner tax-period dollar inflows accelerated, according to Bank of Zambia daily commentary.", sentiment: "POSITIVE", impact: "MEDIUM", symbols: "" },
  { headline: "LuSE records strongest quarter since 2021 on foreign inflows", body: "Turnover on the Lusaka Securities Exchange jumped 38% quarter-on-quarter as foreign investors returned to banking and telecom counters, dealers said.", sentiment: "POSITIVE", impact: "MEDIUM", symbols: "" },
  { headline: "IMF completes fifth review of Zambia's ECF, releases US$184 million tranche", body: "The Fund praised fiscal consolidation progress and rebuilt reserves, while urging continued energy-sector cost-reflective tariff reform.", sentiment: "POSITIVE", impact: "HIGH", symbols: "" },
  { headline: "El Niño outlook: MET Department forecasts normal-to-above rains for 2025/26 season", body: "The seasonal forecast points to adequate rainfall across major maize belts, a positive signal for agro-processors and brewery input costs.", sentiment: "POSITIVE", impact: "LOW", symbols: "ZSUG,ZMBF,NBL" },
];

async function main() {
  console.log("Seeding LuSE market terminal...");
  const days = tradingDays(252);

  await db.dailyPrice.deleteMany();
  await db.newsItem.deleteMany();
  await db.trade.deleteMany();
  await db.position.deleteMany();
  await db.watchlistItem.deleteMany();
  await db.alert.deleteMany();
  await db.stock.deleteMany();
  await db.cashAccount.deleteMany();

  for (const s of config.stocks) {
    await db.stock.create({
      data: {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        description: s.description,
        sharesOutstanding: s.sharesOutstanding,
        peRatio: s.peRatio,
        dividendYield: s.dividendYield,
        eps: s.eps,
        beta: s.beta,
        website: s.website,
        anchorPrice: s.price,
      },
    });
    const series = generateDailySeries(s.price, s.beta, days.length);
    const rows = series.map((p, i) => ({ ...p, date: days[i], symbol: s.symbol }));
    // chunk insert
    for (let i = 0; i < rows.length; i += 60) {
      await db.dailyPrice.createMany({ data: rows.slice(i, i + 60) });
    }
    console.log(`  ✓ ${s.symbol}: ${rows.length} daily bars`);
  }

  // Seeded news spread over the last 10 days
  const now = Date.now();
  let newsIdx = 0;
  for (const macro of MACRO_NEWS) {
    await db.newsItem.create({
      data: {
        headline: macro.headline,
        body: macro.body,
        source: "LuSE Wire",
        symbols: macro.symbols,
        sentiment: macro.sentiment,
        impact: macro.impact,
        publishedAt: new Date(now - (newsIdx + 1) * 7.5 * 3600 * 1000),
      },
    });
    newsIdx++;
  }
  for (const s of config.stocks) {
    const t = NEWS_TEMPLATES[newsIdx % NEWS_TEMPLATES.length];
    const m = t.make(s.name, s.symbol);
    await db.newsItem.create({
      data: {
        headline: m.headline,
        body: m.body,
        source: "LuSE Wire",
        symbols: s.symbol,
        sentiment: t.sentiment,
        impact: t.impact,
        publishedAt: new Date(now - (newsIdx + 1) * 5.2 * 3600 * 1000),
      },
    });
    newsIdx++;
  }

  await db.cashAccount.create({ data: { id: "MAIN", balance: 100000, initialBalance: 100000 } });
  for (const sym of ["ZANACO", "ZCCM-IH", "ATEL", "ZSUG"]) {
    await db.watchlistItem.create({ data: { symbol: sym } });
  }
  // one example alert
  await db.alert.create({ data: { symbol: "ZANACO", condition: "ABOVE", targetPrice: 9.8 } });

  const counts = {
    stocks: await db.stock.count(),
    daily: await db.dailyPrice.count(),
    news: await db.newsItem.count(),
    watchlist: await db.watchlistItem.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
