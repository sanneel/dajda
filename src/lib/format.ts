/**
 * Formatting helpers for the integer minor-unit convention used across the
 * schema. Every value stored as *Milli / *Centi / *Minor is rendered here so
 * that no component divides by 1000 on its own.
 *
 * Client-safe: no Node built-ins, no env access.
 */
import { tbilisiClock } from '@/lib/time';

/** 1850 -> "1.85" */
export function formatOdds(oddsMilli: number): string {
  return (oddsMilli / 1000).toFixed(2);
}

/** 1500 -> "1.5", 2000 -> "2" */
export function formatLine(lineMilli: number | null | undefined): string {
  if (lineMilli === null || lineMilli === undefined) return '';
  const value = lineMilli / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

/** 100 -> "1.00", -250 -> "-2.50" */
export function formatUnits(unitsCenti: number): string {
  return (unitsCenti / 100).toFixed(2);
}

/** 250 -> "+2.50", -250 -> "-2.50", 0 -> "0.00" */
/**
 * Profit expressed in GEL under the site's stated convention: every ticket
 * is counted as a flat 100 GEL stake. One unit is exactly that stake, so
 * profitUnitsCenti (hundredths of a unit) IS the lari figure.
 */
export function formatGelSigned(profitUnitsCenti: number): string {
  const lari = Math.round(profitUnitsCenti);
  const sign = lari > 0 ? '+' : lari < 0 ? '−' : '';
  return `${sign}${Math.abs(lari).toLocaleString('ka-GE')} ₾`;
}

export function formatUnitsSigned(unitsCenti: number): string {
  const formatted = formatUnits(Math.abs(unitsCenti));
  if (unitsCenti > 0) return `+${formatted}`;
  if (unitsCenti < 0) return `-${formatted}`;
  return '0.00';
}

const CURRENCY_SYMBOL: Record<string, string> = {
  GEL: '₾',
  USD: '$',
  EUR: '€',
};

/** 1200, "GEL" -> "12.00 ₾" */
export function formatMoney(amountMinor: number, currency = 'GEL'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  return `${(amountMinor / 100).toFixed(2)} ${symbol}`;
}

/** Basis points to a percentage string: 6712 -> "67.1%" */
export function formatPercentBps(bps: number, fractionDigits = 1): string {
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}

/** Signed percentage: -430 -> "-4.3%" */
export function formatPercentBpsSigned(bps: number, fractionDigits = 1): string {
  const sign = bps > 0 ? '+' : '';
  return `${sign}${(bps / 100).toFixed(fractionDigits)}%`;
}

const KA_MONTHS = [
  'იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ',
  'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ',
];

/**
 * "12 აგვ 2026", on the Tbilisi wall clock.
 *
 * Not the server's clock and not UTC. Every reader of this site is reading a
 * Georgian calendar: a match at 21:00 in Tbilisi has to say 21:00, and an
 * instant stamped at Tbilisi midnight - the withdrawal window is exactly that
 * - reads as the day before if it is formatted in UTC.
 */
export function formatDateKa(date: Date | string): string {
  const d = tbilisiClock(typeof date === 'string' ? new Date(date) : date);
  const month = KA_MONTHS[d.getUTCMonth()] ?? '';
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/** "12 აგვ 2026, 19:30", on the Tbilisi wall clock. */
export function formatDateTimeKa(date: Date | string): string {
  const d = tbilisiClock(typeof date === 'string' ? new Date(date) : date);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const month = KA_MONTHS[d.getUTCMonth()] ?? '';
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** "2026-08" -> "აგვ 2026" */
export function formatMonthKa(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const index = Number(month) - 1;
  return `${KA_MONTHS[index] ?? month} ${year}`;
}

/** Initials for the avatar placeholder: "გიორგი ბერიძე" -> "გბ" */
export function initialsOf(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}
