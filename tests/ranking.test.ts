import { describe, expect, it } from 'vitest';
import { sortAnalysts, type AnalystListItem } from '@/lib/stats/ranking';
import {
  summarizePerformance,
  rankingScore,
  isLowSample,
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
    headline: null,
    isDemo: true,
    sports: [],
    allTime: summary,
    last30Days: summary,
    activeBets: 0,
    lowSample: isLowSample(summary),
    score: rankingScore(summary),
    cheapestPlan: null,
  };
}

describe('analyst ordering', () => {
  it('places an adequately-sampled analyst above a hot short record', () => {
    // The exact case seen in the seeded data: 7-2 at long odds turns a much
    // better profit per unit staked than 26-13, on far less evidence.
    const hotStreak = analyst('short record', 7, 2, 3000);
    const established = analyst('long record', 26, 13, 2000);

    expect(hotStreak.lowSample).toBe(true);
    expect(established.lowSample).toBe(false);
    const perUnit = (a: typeof hotStreak) =>
      a.allTime.profitUnitsCenti / a.allTime.stakedUnitsCenti;
    expect(perUnit(hotStreak)).toBeGreaterThan(perUnit(established));

    const sorted = sortAnalysts([hotStreak, established], 'score');
    expect(sorted[0]?.displayName).toBe('long record');
    // Still listed, not hidden.
    expect(sorted).toHaveLength(2);
  });

  it('orders adequately-sampled analysts among themselves by score', () => {
    const better = analyst('better', 40, 20);
    const worse = analyst('worse', 30, 30);

    const sorted = sortAnalysts([worse, better], 'score');
    expect(sorted.map((entry) => entry.displayName)).toEqual([
      'better',
      'worse',
    ]);
  });

  it('orders low-sample analysts among themselves rather than dropping them', () => {
    const strong = analyst('strong', 8, 1);
    const weak = analyst('weak', 1, 8);

    const sorted = sortAnalysts([weak, strong], 'score');
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

    expect(bigProfit.allTime.profitUnitsCenti).toBeGreaterThan(
      steady.allTime.profitUnitsCenti,
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
    sortAnalysts(input, 'score');
    expect(input.map((entry) => entry.displayName)).toEqual(snapshot);
  });
});
