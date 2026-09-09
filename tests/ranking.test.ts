import { describe, expect, it } from 'vitest';
import { sortAnalysts, type AnalystListItem } from '@/lib/stats/ranking';
import {
  summarizePerformance,
  type PerformanceRecord,
} from '@/lib/stats/performance';

/**
 * Leaderboard ordering.
 *
 * These assertions encode the promise the analyst list page makes: a short
 * record never outranks a long one just because its rate looks better.
 */

function records(
  won: number,
  lost: number,
  oddsMilli = 2000,
): PerformanceRecord[] {
  const make = (status: 'WON' | 'LOST'): PerformanceRecord => ({
    status,
    oddsMilli,
    stakeUnitsCenti: 100,
    profitUnitsCenti:
      status === 'WON' ? Math.round((100 * (oddsMilli - 1000)) / 1000) : -100,
    publishedAt: new Date('2026-06-01T00:00:00Z'),
  });

  return [
    ...Array.from({ length: won }, () => make('WON')),
    ...Array.from({ length: lost }, () => make('LOST')),
  ];
}

function analyst(
  displayName: string,
  won: number,
  lost: number,
  oddsMilli = 2000,
): AnalystListItem {
  const summary = summarizePerformance(records(won, lost, oddsMilli));

  return {
    id: displayName,
    slug: displayName,
    displayName,
    photoPath: null,
    headline: null,
    isDemo: true,
    monthlyMinimum: null,
    sports: [],
    stats: summary,
    avgPerWeek: 0,
    activeBets: 0,
    cheapestPlan: null,
  };
}

describe('analyst ordering', () => {
  /*
   * Sample size stopped being a tiebreak on 2026-09-10, when the "მცირე
   * შერჩევა" label and the function behind it were removed at the owner's
   * request. The ordering is now the selected metric and nothing else, so a
   * short hot record CAN lead the list. The count is printed beside every
   * figure, which is what a reader has to judge it by.
   */
  it('orders purely by the selected metric, short records included', () => {
    const hotStreak = analyst('short record', 7, 2, 3000);
    const established = analyst('long record', 26, 13, 2000);

    const sorted = sortAnalysts([hotStreak, established], 'accuracy');
    expect(sorted[0]?.displayName).toBe('short record');
    // Both listed, neither hidden.
    expect(sorted).toHaveLength(2);
  });

  it('orders adequately-sampled analysts among themselves by accuracy', () => {
    const better = analyst('better', 40, 20);
    const worse = analyst('worse', 30, 30);

    const sorted = sortAnalysts([worse, better], 'accuracy');
    expect(sorted.map((entry) => entry.displayName)).toEqual([
      'better',
      'worse',
    ]);
  });

  it('orders low-sample analysts among themselves rather than dropping them', () => {
    const strong = analyst('strong', 8, 1);
    const weak = analyst('weak', 1, 8);

    const sorted = sortAnalysts([weak, strong], 'accuracy');
    expect(sorted.map((entry) => entry.displayName)).toEqual([
      'strong',
      'weak',
    ]);
  });

  it('does not apply the sample gate to explicit profit ordering', () => {
    // "ერთეულები" is an explicit request for raw profit; it should answer
    // that question literally.
    const bigProfit = analyst('big profit', 9, 0, 4000);
    const steady = analyst('steady', 30, 25);

    expect(bigProfit.stats.profitUnitsCenti).toBeGreaterThan(
      steady.stats.profitUnitsCenti,
    );
    const sorted = sortAnalysts([steady, bigProfit], 'profit');
    expect(sorted[0]?.displayName).toBe('big profit');
  });

  it('orders by volume when asked', () => {
    const many = analyst('many', 30, 30);
    const few = analyst('few', 2, 2);

    expect(sortAnalysts([few, many], 'volume')[0]?.displayName).toBe('many');
  });

  it('does not mutate the input array', () => {
    const input = [analyst('a', 30, 10), analyst('b', 40, 10)];
    const snapshot = input.map((entry) => entry.displayName);
    sortAnalysts(input, 'profit');
    expect(input.map((entry) => entry.displayName)).toEqual(snapshot);
  });
});
