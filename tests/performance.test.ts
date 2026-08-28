import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE_FOR_RANKING,
  cumulativeUnits,
  isLowSample,
  monthlyPerformance,
  rankingScore,
  summarizePerformance,
  withinDays,
  type PerformanceRecord,
} from '@/lib/stats/performance';

function record(
  overrides: Partial<PerformanceRecord> & Pick<PerformanceRecord, 'status'>,
): PerformanceRecord {
  const stake = overrides.stakeUnitsCenti ?? 100;
  const odds = overrides.oddsMilli ?? 2000;

  return {
    oddsMilli: odds,
    stakeUnitsCenti: stake,
    publishedAt: new Date('2026-06-01T12:00:00Z'),
    profitUnitsCenti:
      overrides.status === 'WON'
        ? Math.round((stake * (odds - 1000)) / 1000)
        : overrides.status === 'LOST'
          ? -stake
          : overrides.status === 'PENDING'
            ? null
            : 0,
    ...overrides,
  };
}

describe('summarizePerformance', () => {
  it('returns an empty summary for no records', () => {
    const summary = summarizePerformance([]);
    expect(summary.total).toBe(0);
    expect(summary.hitRateBps).toBe(0);
    expect(summary.profitUnitsCenti).toBe(0);
    expect(summary.currentStreak).toEqual({ kind: 'NONE', count: 0 });
  });

  it('counts each status separately', () => {
    const summary = summarizePerformance([
      record({ status: 'WON' }),
      record({ status: 'WON' }),
      record({ status: 'LOST' }),
      record({ status: 'PENDING' }),
      record({ status: 'VOID' }),
      record({ status: 'PUSH' }),
    ]);

    expect(summary.total).toBe(6);
    expect(summary.won).toBe(2);
    expect(summary.lost).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.voided).toBe(1);
    expect(summary.pushed).toBe(1);
    expect(summary.decided).toBe(3);
  });

  it('computes hit rate over decided predictions only', () => {
    const summary = summarizePerformance([
      record({ status: 'WON' }),
      record({ status: 'WON' }),
      record({ status: 'LOST' }),
    ]);
    // 2 of 3 = 66.67%
    expect(summary.hitRateBps).toBe(6667);
  });

  it('excludes VOID and PUSH from the hit rate denominator', () => {
    const withReturns = summarizePerformance([
      record({ status: 'WON' }),
      record({ status: 'LOST' }),
      record({ status: 'VOID' }),
      record({ status: 'PUSH' }),
    ]);
    // Still 1 of 2, not 1 of 4 - a returned stake was never right or wrong.
    expect(withReturns.hitRateBps).toBe(5000);
    expect(withReturns.decided).toBe(2);
  });

  it('excludes VOID and PUSH from staked units', () => {
    const base = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'LOST' }),
    ]);
    const withVoid = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'LOST' }),
      record({ status: 'VOID' }),
    ]);

    // A VOID returns the stake: it changes neither profit nor what was
    // risked, which is the whole reason it is not counted as a loss.
    expect(withVoid.profitUnitsCenti).toBe(base.profitUnitsCenti);
    expect(withVoid.stakedUnitsCenti).toBe(200);
  });

  it('ignores PENDING predictions in the staked total', () => {
    const summary = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'PENDING', stakeUnitsCenti: 500 }),
    ]);
    expect(summary.stakedUnitsCenti).toBe(100);
    expect(summary.profitUnitsCenti).toBe(100);
  });

  it('accumulates profit against what was staked', () => {
    // One 2.00 win (+1.00) and one loss (-1.00) on 1 unit each: 0 profit.
    const breakEven = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'LOST' }),
    ]);
    expect(breakEven.profitUnitsCenti).toBe(0);
    expect(breakEven.stakedUnitsCenti).toBe(200);

    // Two 2.00 wins on 1 unit each: +2.00 on 2.00 staked.
    const doubled = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'WON', oddsMilli: 2000 }),
    ]);
    expect(doubled.profitUnitsCenti).toBe(200);
    expect(doubled.stakedUnitsCenti).toBe(200);
  });

  it('reports a losing record honestly', () => {
    const summary = summarizePerformance([
      record({ status: 'LOST' }),
      record({ status: 'LOST' }),
      record({ status: 'WON', oddsMilli: 1500 }),
    ]);
    expect(summary.profitUnitsCenti).toBe(-150);
  });

  it('averages odds over decided predictions', () => {
    const summary = summarizePerformance([
      record({ status: 'WON', oddsMilli: 2000 }),
      record({ status: 'LOST', oddsMilli: 1000 + 1000 }),
      record({ status: 'PENDING', oddsMilli: 9000 }),
    ]);
    expect(summary.avgOddsMilli).toBe(2000);
  });
});

describe('streaks', () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (offset: number) =>
    new Date(new Date('2026-06-01T00:00:00Z').getTime() + offset * day);

  it('reports the current run of wins', () => {
    const summary = summarizePerformance([
      record({ status: 'LOST', publishedAt: at(0) }),
      record({ status: 'WON', publishedAt: at(1) }),
      record({ status: 'WON', publishedAt: at(2) }),
      record({ status: 'WON', publishedAt: at(3) }),
    ]);
    expect(summary.currentStreak).toEqual({ kind: 'WON', count: 3 });
    expect(summary.bestWinStreak).toBe(3);
  });

  it('reports a losing run without softening it', () => {
    const summary = summarizePerformance([
      record({ status: 'WON', publishedAt: at(0) }),
      record({ status: 'LOST', publishedAt: at(1) }),
      record({ status: 'LOST', publishedAt: at(2) }),
    ]);
    expect(summary.currentStreak).toEqual({ kind: 'LOST', count: 2 });
    expect(summary.worstLossStreak).toBe(2);
  });

  it('does not let VOID or PENDING break a run', () => {
    const summary = summarizePerformance([
      record({ status: 'WON', publishedAt: at(0) }),
      record({ status: 'VOID', publishedAt: at(1) }),
      record({ status: 'PENDING', publishedAt: at(2) }),
      record({ status: 'WON', publishedAt: at(3) }),
    ]);
    expect(summary.currentStreak).toEqual({ kind: 'WON', count: 2 });
  });

  it('orders by publication date, not array order', () => {
    const summary = summarizePerformance([
      record({ status: 'WON', publishedAt: at(5) }),
      record({ status: 'LOST', publishedAt: at(1) }),
    ]);
    expect(summary.currentStreak).toEqual({ kind: 'WON', count: 1 });
  });
});

describe('chart series', () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (offset: number) =>
    new Date(new Date('2026-06-01T00:00:00Z').getTime() + offset * day);

  it('accumulates units in chronological order', () => {
    const points = cumulativeUnits([
      record({ status: 'WON', oddsMilli: 2000, publishedAt: at(0) }),
      record({ status: 'LOST', publishedAt: at(1) }),
      record({ status: 'WON', oddsMilli: 3000, publishedAt: at(2) }),
    ]);

    expect(points.map((point) => point.cumulativeUnitsCenti)).toEqual([
      100, 0, 200,
    ]);
  });

  it('omits pending predictions from the curve', () => {
    const points = cumulativeUnits([
      record({ status: 'WON', oddsMilli: 2000, publishedAt: at(0) }),
      record({ status: 'PENDING', publishedAt: at(1) }),
    ]);
    expect(points).toHaveLength(1);
  });

  it('buckets results by calendar month', () => {
    const buckets = monthlyPerformance([
      record({ status: 'WON', oddsMilli: 2000, publishedAt: new Date('2026-05-04T00:00:00Z') }),
      record({ status: 'LOST', publishedAt: new Date('2026-05-20T00:00:00Z') }),
      record({ status: 'WON', oddsMilli: 2000, publishedAt: new Date('2026-06-02T00:00:00Z') }),
    ]);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ month: '2026-05', won: 1, lost: 1 });
    expect(buckets[1]).toMatchObject({ month: '2026-06', won: 1, lost: 0 });
  });
});

describe('ranking', () => {
  const many = (count: number, status: PerformanceRecord['status']) =>
    Array.from({ length: count }, () => record({ status, oddsMilli: 2000 }));

  it('flags a short record as low sample', () => {
    expect(isLowSample(summarizePerformance(many(3, 'WON')))).toBe(true);
    expect(
      isLowSample(summarizePerformance(many(MIN_SAMPLE_FOR_RANKING, 'WON'))),
    ).toBe(false);
  });

  it('does not let a perfect 3-for-3 outrank a strong long record', () => {
    // This is the central ranking guarantee: sample size must matter.
    const tiny = summarizePerformance(many(3, 'WON'));

    const longRecord = summarizePerformance([
      ...many(120, 'WON'),
      ...many(80, 'LOST'),
    ]);

    expect(tiny.hitRateBps).toBe(10_000);
    expect(longRecord.hitRateBps).toBeLessThan(tiny.hitRateBps);
    // ...yet the long, profitable record scores higher.
    expect(rankingScore(longRecord)).toBeGreaterThan(rankingScore(tiny));
  });

  it('shrinks a small sample toward zero', () => {
    const small = summarizePerformance(many(2, 'WON'));
    const large = summarizePerformance(many(200, 'WON'));
    // Same 100% hit rate and same per-bet edge, but the larger sample earns
    // a score much closer to the unshrunk profit-over-stake ratio.
    expect(rankingScore(large)).toBeGreaterThan(rankingScore(small));
    const unshrunk = Math.round(
      (small.profitUnitsCenti * 10_000) / small.stakedUnitsCenti,
    );
    expect(rankingScore(small)).toBeLessThan(unshrunk);
  });

  it('scores a losing record below zero', () => {
    expect(rankingScore(summarizePerformance(many(50, 'LOST')))).toBeLessThan(0);
  });

  it('gives an empty record a neutral score', () => {
    expect(rankingScore(summarizePerformance([]))).toBe(0);
  });
});

describe('withinDays', () => {
  it('keeps only records inside the window', () => {
    const now = new Date('2026-08-11T00:00:00Z');
    const day = 24 * 60 * 60 * 1000;

    const records = [
      record({ status: 'WON', publishedAt: new Date(now.getTime() - 5 * day) }),
      record({ status: 'LOST', publishedAt: new Date(now.getTime() - 40 * day) }),
    ];

    expect(withinDays(records, 30, now)).toHaveLength(1);
  });
});
