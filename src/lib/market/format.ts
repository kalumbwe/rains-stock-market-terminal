/**
 * Rains Stock Market — number/time formatters.
 * All monetary values are Zambian Kwacha (ZMW, symbol "K").
 * Rendered with monospace + tabular figures on the client.
 */

/** "K9.43" — price in kwacha, 2dp. */
export function fmtK(price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return '—';
  return `K${price.toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Big-number compact form with ZMW suffix: 1.25M / 2.4B ZMW. */
export function fmtBig(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${trim(n / 1e12)}T ZMW`;
  if (abs >= 1e9) return `${trim(n / 1e9)}B ZMW`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M ZMW`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K ZMW`;
  return `${trim(n)} ZMW`;
}

/** Compact plain number (no currency): volumes, shares. */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return n.toLocaleString('en-ZM');
}

/** "+0.32%" / "−1.10%" / "0.00%" — uses true minus sign for negatives. */
export function fmtPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/** Signed kwacha delta: "+0.03" / "−1.20". */
export function fmtSignedK(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}K${Math.abs(v).toFixed(2)}`;
}

/** Signed P&L in kwacha: "+K1,250.00". */
export function fmtSignedMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}K${Math.abs(v).toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Plain kwacha amount with separators: "K100,000.00". */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `K${v.toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Index points: "25,734.78". */
export function fmtIndex(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** HH:mm in Africa/Lusaka (CAT). Client-only usage to avoid hydration issues. */
export function fmtTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** HH:mm:ss in Africa/Lusaka (CAT). */
export function fmtTimeSec(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

/** "12 Mar" / "12 Mar 24" in Africa/Lusaka. */
export function fmtDate(iso: string | number | Date | null | undefined, withYear = false): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: '2-digit' } : {}),
  }).format(d);
}

/** "12 Mar, 10:45 CAT" — for news timestamps. */
export function fmtDateTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)}, ${fmtTime(d)} CAT`;
}

/** Relative "3m ago" style label. */
export function fmtAgo(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function trim(n: number): string {
  // 1.25 → "1.25", 1.20 → "1.2", 2.0 → "2"
  return Number(n.toFixed(2)).toString();
}
