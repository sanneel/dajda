import type { PredictionStatus } from '@/generated/prisma/enums';

/**
 * Analyst performance mathematics.
 *
 * Pure functions over plain records, so every figure the platform publishes can
 * be recomputed and asserted in a test.
 *
 * Two deliberate rules:
 *  - VOID and PUSH return the stake, so they are excluded from both the hit
 *    rate denominator and the staked total. Counting them as wins would inflate
 *    a record; counting them as losses would understate it.
 *  - Ranking is never bare win rate (see `rankingScore`).
 */

export type PerformanceRecord = {
  status: PredictionStatus;
  oddsMilli: number;
  stakeUnitsCenti: number;
  /** Null while PENDING. */
  profitUnitsCenti: number | null;
  publishedAt: Date;
};

export type StreakKind = 'WON' | 'LOST' | 'NONE';

export type Streak = { kind: StreakKind; count: number };

export type PerformanceSummary = {
  total: number;
  pending: number;
  won: number;
  lost: number;
  voided: number;
  pushed: number;
  /** WON + LOST - the only predictions that can be right or wrong. */
  decided: number;
  /** Hit rate in basis points (6712 = 67.12%). */
  hitRateBps: number;
  stakedUnitsCenti: number;
  profitUnitsCenti: number;
  avgOddsMilli: number;
  currentStreak: Streak;
  bestWinStreak: number;
  worstLossStreak: number;
};

/** Below this many decided predictions, a rate is not yet meaningful. */
export const MIN_SAMPLE_FOR_RANKING = 20;

const EMPTY_SUMMARY: PerformanceSummary = {
  total: 0,
  pending: 0,
  won: 0,
  lost: 0,
  voided: 0,
  pushed: 0,
  decided: 0,
  hitRateBps: 0,
  stakedUnitsCenti: 0,
  profitUnitsCenti: 0,
  avgOddsMilli: 0,
  currentStreak: { kind: 'NONE', count: 0 },
  bestWinStreak: 0,
  worstLossStreak: 0,
};

function chronological(
  records: readonly PerformanceRecord[],
): PerformanceRecord[] {
  return [...records].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
  );
}

export function summarizePerformance(
  records: readonly PerformanceRecord[],
): PerformanceSummary {
  if (records.length === 0) return { ...EMPTY_SUMMARY };

  let won = 0;
  let lost = 0;
  let pending = 0;
  let voided = 0;
  let pushed = 0;
  let stakedUnitsCenti = 0;
  let profitUnitsCenti = 0;
  let oddsSum = 0;
  let oddsCount = 0;

  for (const record of records) {
    switch (record.status) {
      case 'WON':
        won += 1;
        break;
      case 'LOST':
        lost += 1;
        break;
      case 'VOID':
        voided += 1;
        break;
      case 'PUSH':
        pushed += 1;
        break;
      case 'PENDING':
        pending += 1;
        break;
    }

    // A returned stake was never truly at risk.
    if (record.status === 'WON' || record.status === 'LOST') {
      stakedUnitsCenti += record.stakeUnitsCenti;
      profitUnitsCenti += record.profitUnitsCenti ?? 0;
      oddsSum += record.oddsMilli;
      oddsCount += 1;
    }
  }

  const decided = won + lost;

  const { currentStreak, bestWinStreak, worstLossStreak } =
    computeStreaks(records);

  return {
    total: records.length,
    pending,
    won,
    lost,
    voided,
    pushed,
    decided,
    hitRateBps: decided === 0 ? 0 : Math.round((won * 10_000) / decided),
    stakedUnitsCenti,
    profitUnitsCenti,
    avgOddsMilli: oddsCount === 0 ? 0 : Math.round(oddsSum / oddsCount),
    currentStreak,
    bestWinStreak,
    worstLossStreak,
  };
}

/**
 * Streaks run over decided predictions only; VOID/PUSH are transparent and
 * neither extend nor break a run.
 */
export function computeStreaks(records: readonly PerformanceRecord[]): {
  currentStreak: Streak;
  bestWinStreak: number;
  worstLossStreak: number;
} {
  const decided = chronological(records).filter(
    (record) => record.status === 'WON' || record.status === 'LOST',
  );

  let bestWinStreak = 0;
  let worstLossStreak = 0;
  let runKind: StreakKind = 'NONE';
  let runLength = 0;

  for (const record of decided) {
    const kind: StreakKind = record.status === 'WON' ? 'WON' : 'LOST';
    if (kind === runKind) {
      runLength += 1;
    } else {
      runKind = kind;
      runLength = 1;
    }
    if (kind === 'WON') bestWinStreak = Math.max(bestWinStreak, runLength);
    else worstLossStreak = Math.max(worstLossStreak, runLength);
  }

  return {
    currentStreak:
      runKind === 'NONE' ? { kind: 'NONE', count: 0 } : { kind: runKind, count: runLength },
    bestWinStreak,
    worstLossStreak,
  };
}

export type CumulativePoint = {
  index: number;
  date: Date;
  cumulativeUnitsCenti: number;
};

/** Running profit after each settled prediction, for the profile chart. */
export function cumulativeUnits(
  records: readonly PerformanceRecord[],
): CumulativePoint[] {
  const settled = chronological(records).filter(
    (record) => record.profitUnitsCenti !== null && record.status !== 'PENDING',
  );

  let running = 0;
  return settled.map((record, index) => {
    running += record.profitUnitsCenti ?? 0;
    return {
      index: index + 1,
      date: record.publishedAt,
      cumulativeUnitsCenti: running,
    };
  });
}

export type MonthlyBucket = {
  /** "2026-08" */
  month: string;
  won: number;
  lost: number;
  profitUnitsCenti: number;
};

export function monthlyPerformance(
  records: readonly PerformanceRecord[],
): MonthlyBucket[] {
  const buckets = new Map<string, MonthlyBucket>();

  for (const record of chronological(records)) {
    if (record.status === 'PENDING') continue;

    const month = `${record.publishedAt.getUTCFullYear()}-${String(
      record.publishedAt.getUTCMonth() + 1,
    ).padStart(2, '0')}`;

    const bucket = buckets.get(month) ?? {
      month,
      won: 0,
      lost: 0,
      profitUnitsCenti: 0,
    };

    if (record.status === 'WON') bucket.won += 1;
    if (record.status === 'LOST') bucket.lost += 1;
    bucket.profitUnitsCenti += record.profitUnitsCenti ?? 0;

    buckets.set(month, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Ranking score, in basis points.
 *
 * Not win rate: a 3-for-3 analyst must not outrank a 180-for-300 one. The
 * score is profit over stake, shrunk toward zero by a prior of
 * `MIN_SAMPLE_FOR_RANKING` units, so a small sample is pulled to the middle
 * of the table until it earns its position. It is never displayed: it exists
 * to order the list, and the figures a reader judges by (record, accuracy,
 * units) are shown alongside.
 */
export function rankingScore(summary: PerformanceSummary): number {
  const priorCenti = MIN_SAMPLE_FOR_RANKING * 100;
  const denominator = summary.stakedUnitsCenti + priorCenti;
  if (denominator === 0) return 0;
  return Math.round((summary.profitUnitsCenti * 10_000) / denominator);
}

/** True when the record is still too short to read much into. */
export function isLowSample(summary: PerformanceSummary): boolean {
  return summary.decided < MIN_SAMPLE_FOR_RANKING;
}

/** Restrict a record to a trailing window, e.g. "ბოლო 30 დღე". */
export function withinDays(
  records: readonly PerformanceRecord[],
  days: number,
  now: Date = new Date(),
): PerformanceRecord[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return records.filter((record) => record.publishedAt.getTime() >= cutoff);
}
