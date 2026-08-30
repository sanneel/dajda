import type { BillingPeriod } from '@/generated/prisma/enums';
import type { PerformanceSummary } from './performance';

/**
 * Leaderboard shape and ordering.
 *
 * Kept free of Prisma imports so the ordering rules - the part that decides
 * whose record the reader sees first - can be unit tested directly.
 */

export type AnalystListItem = {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  isDemo: boolean;
  sports: { code: string; nameKa: string }[];
  /** The record over the period the reader selected (default: all time). */
  stats: PerformanceSummary;
  /** Published tickets per week, averaged over the selected period. */
  avgPerWeek: number;
  lowSample: boolean;
  /** Published bets still running: what a new subscriber gets access to now. */
  activeBets: number;
  cheapestPlan: {
    id: string;
    priceMinor: number;
    currency: string;
    billingPeriod: BillingPeriod;
  } | null;
};

export type AnalystSort = 'profit' | 'accuracy' | 'odds-high' | 'volume';

/** The period filter: how far back the displayed record reaches. */
export type AnalystPeriod = 'all' | '30' | '90' | '180';

export const PERIOD_DAYS: Record<Exclude<AnalystPeriod, 'all'>, number> = {
  '30': 30,
  '90': 90,
  '180': 180,
};

/**
 * Ordering rules.
 *
 * Accuracy is gated: a 3-0 week must not sit above a 60% record earned over
 * forty bets, so low-sample analysts sort below adequately-sampled ones
 * whatever their rate says. Profit, volume and average odds answer the exact
 * question the reader asked and are not gated.
 */
export function sortAnalysts(
  items: AnalystListItem[],
  sort: AnalystSort,
): AnalystListItem[] {
  const sorted = [...items];

  switch (sort) {
    case 'accuracy':
      sorted.sort(
        (a, b) =>
          Number(a.lowSample) - Number(b.lowSample) ||
          b.stats.hitRateBps - a.stats.hitRateBps ||
          b.stats.decided - a.stats.decided,
      );
      break;
    case 'odds-high':
      sorted.sort((a, b) => b.stats.avgOddsMilli - a.stats.avgOddsMilli);
      break;
    case 'volume':
      sorted.sort((a, b) => b.stats.total - a.stats.total);
      break;
    case 'profit':
    default:
      sorted.sort(
        (a, b) =>
          b.stats.profitUnitsCenti - a.stats.profitUnitsCenti ||
          b.stats.decided - a.stats.decided,
      );
      break;
  }

  return sorted;
}
