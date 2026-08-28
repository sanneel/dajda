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
  allTime: PerformanceSummary;
  last30Days: PerformanceSummary;
  lowSample: boolean;
  score: number;
  /** Published bets still running: what a new subscriber gets access to now. */
  activeBets: number;
  cheapestPlan: {
    id: string;
    priceMinor: number;
    currency: string;
    billingPeriod: BillingPeriod;
  } | null;
};

export type AnalystSort = 'score' | 'profit' | 'volume' | 'recent';

/**
 * Ordering never uses hit rate on its own.
 *
 * The default ordering applies two rules in sequence:
 *   1. analysts with an adequate sample come first, always
 *   2. within each group, the sample-shrunk score decides
 *
 * Rule 1 exists because shrinkage alone is not sufficient. An analyst who is
 * 7-2 at long odds can out-score a 26-13 record on the shrunk score, and putting
 * them at the top of the table would imply an evidential standing they have
 * not earned. Low-sample analysts stay visible and clearly badged - just not
 * above people with a real track record.
 *
 * The explicit sorts (profit, volume, recent) answer the question the reader
 * actually asked and are not gated.
 */
export function sortAnalysts(
  items: AnalystListItem[],
  sort: AnalystSort,
): AnalystListItem[] {
  const sorted = [...items];

  switch (sort) {
    case 'profit':
      sorted.sort(
        (a, b) =>
          b.allTime.profitUnitsCenti - a.allTime.profitUnitsCenti ||
          b.allTime.decided - a.allTime.decided,
      );
      break;
    case 'volume':
      sorted.sort((a, b) => b.allTime.total - a.allTime.total);
      break;
    case 'recent':
      sorted.sort(
        (a, b) =>
          b.last30Days.profitUnitsCenti - a.last30Days.profitUnitsCenti ||
          b.last30Days.decided - a.last30Days.decided,
      );
      break;
    case 'score':
    default:
      sorted.sort(
        (a, b) =>
          Number(a.lowSample) - Number(b.lowSample) ||
          b.score - a.score ||
          b.allTime.decided - a.allTime.decided,
      );
      break;
  }

  return sorted;
}
