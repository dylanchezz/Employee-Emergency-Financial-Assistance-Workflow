// Phase 8 — ONE place for how dates and money are shown (no drifting toLocaleString() calls).
// Dates are always day/month/year (en-GB), never the browser's default order, so a Kenyan reader
// never sees 11/1/2026 and wonders if it is January or November. Time is 24-hour.

type DateInput = string | number | Date | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** 11/11/2026 */
export const formatDate = (v: DateInput) => { const d = toDate(v); return d ? DATE.format(d) : "—"; };
/** 18:46 */
export const formatTime = (v: DateInput) => { const d = toDate(v); return d ? TIME.format(d) : "—"; };
/** 11/11/2026, 18:46 */
export const formatDateTime = (v: DateInput) => { const d = toDate(v); return d ? `${DATE.format(d)}, ${TIME.format(d)}` : "—"; };
/** Wednesday, 11 November 2026 (navbar) */
export const formatLongDate = (v: DateInput) => { const d = toDate(v); return d ? LONG.format(d) : "—"; };

/** 5,000,000 — thousands separators fixed to en-GB as well. */
export const formatAmount = (n: number) => new Intl.NumberFormat("en-GB").format(n);
/** KES 5,000,000 */
export const formatKES = (n: number) => `KES ${formatAmount(n)}`;

/** "today", "yesterday", "3 days ago" — for "waiting" / "submitted" hints next to the real date. */
export function formatAgo(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Whole days since a date (0 if in the future / invalid). */
export function daysSince(v: DateInput): number {
  const d = toDate(v);
  return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)) : 0;
}
