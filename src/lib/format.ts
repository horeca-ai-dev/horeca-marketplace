/**
 * Display formatting for money, numbers, dates and times (DESIGN.md → Content and copy):
 *   money  1.234,56 €   ·   date  26.11.2026   ·   time  14:05 (24 h)   ·   decimal comma
 *
 * Formatting only — nothing here calculates. Money arithmetic lives in src/server/domain/money.ts.
 * Usable on the server and in Client Components (no imports beyond the locale constants).
 */
import { APP_LOCALE, APP_TIME_ZONE } from "@/i18n/config";

// BigInt(…) instead of literals like 100n: tsconfig targets ES2017, where BigInt literals are not allowed.
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

const moneyFormat = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: "EUR",
});

const dateFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat(APP_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: APP_TIME_ZONE,
});

/**
 * Integer cents → "1.234,56 €" (non-breaking space before €, so the amount never wraps).
 * The cents are turned into a decimal STRING ("1234.56") and never into a float, so amounts beyond
 * Number.MAX_SAFE_INTEGER keep every digit.
 */
export function formatMoney(cents: bigint): string {
  const negative = cents < ZERO;
  const absolute = negative ? -cents : cents;
  const euros = absolute / HUNDRED;
  const rest = (absolute % HUNDRED).toString().padStart(2, "0");
  const decimal = `${negative ? "-" : ""}${euros}.${rest}`;
  // Intl.NumberFormat formats decimal strings exactly; TypeScript's lib types lag behind on this.
  return moneyFormat.format(decimal as unknown as number);
}

/** A plain number with the decimal comma and dot for thousands: 1234.5 → "1.234,5". */
export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits }).format(
    value,
  );
}

/**
 * "26.11.2026". Built from the parts: the locale's own short date ends with a dot ("26.11.2026."),
 * which DESIGN.md does not use.
 */
export function formatDate(date: Date): string {
  const parts = dateFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}`;
}

/** "14:05" — 24-hour clock. */
export function formatTime(date: Date): string {
  const parts = timeFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
}
