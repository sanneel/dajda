import { describe, expect, it } from 'vitest';
import { analystShareMinor } from '@/lib/balance/ledger';
import {
  checkWithdrawal,
  daysInMonth,
  isWithdrawalWindowOpen,
  luhnValid,
  maskCardNumber,
  nextWithdrawalWindow,
  normaliseCardNumber,
  payoutPeriod,
  tbilisiParts,
  weeklyActivity,
} from '@/lib/payouts/rules';

/**
 * The rules that decide whether money moves, and how much.
 *
 * These are the parts worth pinning: the split an analyst is owed, and the
 * window the agreement promises them. Both are read off a signed document, so
 * a silent change here is a breach rather than a bug.
 */

describe('analyst share', () => {
  it('takes the configured percentage of the gross', () => {
    // The shipped default: 85% to the analyst on a 30 GEL plan.
    expect(analystShareMinor(3000, 85)).toBe(2550);
    expect(analystShareMinor(5000, 85)).toBe(4250);
    expect(analystShareMinor(4000, 85)).toBe(3400);
  });

  it('rounds down, so the platform never owes out more than it took', () => {
    // 85% of 2999 is 2549.15
    expect(analystShareMinor(2999, 85)).toBe(2549);
  });

  it('handles the ends of the range', () => {
    expect(analystShareMinor(3000, 0)).toBe(0);
    expect(analystShareMinor(3000, 100)).toBe(3000);
  });

  it('leaves the platform its cut', () => {
    // What the platform keeps is the complement, and it is never negative.
    for (const gross of [3000, 4000, 5000, 2999, 1]) {
      const share = analystShareMinor(gross, 85);
      expect(gross - share).toBeGreaterThanOrEqual(0);
    }
  });

  it('never returns anything for a non-positive amount', () => {
    expect(analystShareMinor(0, 70)).toBe(0);
    expect(analystShareMinor(-500, 70)).toBe(0);
  });

  it('clamps a misconfigured percentage rather than paying it out', () => {
    expect(analystShareMinor(1000, 500)).toBe(1000);
    expect(analystShareMinor(1000, -20)).toBe(0);
  });
});

describe('Tbilisi calendar', () => {
  it('reads wall-clock parts at UTC+4', () => {
    // 22:00 UTC on the 30th is already the 31st in Tbilisi.
    expect(tbilisiParts(new Date('2026-08-30T22:00:00Z'))).toEqual({
      year: 2026,
      month: 8,
      day: 31,
    });
  });

  it('knows the length of a month, including February in a leap year', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 9)).toBe(30);
  });
});

describe('withdrawal window', () => {
  it('is open on the last day of the month in Tbilisi', () => {
    expect(isWithdrawalWindowOpen(new Date('2026-08-31T09:00:00Z'))).toBe(true);
    expect(isWithdrawalWindowOpen(new Date('2026-09-30T09:00:00Z'))).toBe(true);
  });

  it('is shut on every other day', () => {
    expect(isWithdrawalWindowOpen(new Date('2026-08-30T09:00:00Z'))).toBe(false);
    expect(isWithdrawalWindowOpen(new Date('2026-08-01T09:00:00Z'))).toBe(false);
  });

  it('follows Tbilisi time rather than UTC at the boundary', () => {
    // 21:00 UTC on the 30th is 01:00 on the 31st in Tbilisi: open there,
    // still the 30th in UTC.
    expect(isWithdrawalWindowOpen(new Date('2026-08-30T21:00:00Z'))).toBe(true);
    // 21:00 UTC on the 31st is already the 1st in Tbilisi: shut again.
    expect(isWithdrawalWindowOpen(new Date('2026-08-31T21:00:00Z'))).toBe(false);
  });

  it('points at this month while the window is still ahead', () => {
    const next = nextWithdrawalWindow(new Date('2026-08-10T09:00:00Z'));
    expect(tbilisiParts(next)).toEqual({ year: 2026, month: 8, day: 31 });
  });

  it('points at next month once the window is open', () => {
    const next = nextWithdrawalWindow(new Date('2026-08-31T09:00:00Z'));
    expect(tbilisiParts(next)).toEqual({ year: 2026, month: 9, day: 30 });
  });

  it('rolls over the year end', () => {
    const next = nextWithdrawalWindow(new Date('2026-12-31T09:00:00Z'));
    expect(tbilisiParts(next)).toEqual({ year: 2027, month: 1, day: 31 });
  });
});

describe('payout period', () => {
  it('spans the Tbilisi calendar month as UTC instants', () => {
    const period = payoutPeriod(new Date('2026-08-15T09:00:00Z'));
    // Midnight in Tbilisi is 20:00 the previous day in UTC.
    expect(period.start.toISOString()).toBe('2026-07-31T20:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-31T20:00:00.000Z');
  });

  it('rolls over the year end', () => {
    const period = payoutPeriod(new Date('2026-12-15T09:00:00Z'));
    expect(period.end.toISOString()).toBe('2026-12-31T20:00:00.000Z');
  });
});

describe('card handling', () => {
  it('accepts a valid number, spaces and all', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4111111111111111')).toBe(true);
  });

  it('rejects a mistyped digit', () => {
    expect(luhnValid('4242424242424241')).toBe(false);
  });

  it('rejects lengths no card has', () => {
    expect(luhnValid('42424242')).toBe(false);
    expect(luhnValid('42424242424242424242')).toBe(false);
  });

  it('strips separators before checking', () => {
    expect(normaliseCardNumber('4242-4242 4242.4242')).toBe('4242424242424242');
  });

  it('keeps only the first six and last four when masking', () => {
    expect(maskCardNumber('4242424242424242')).toBe('424242******4242');
    // The mask is what identifies the card later, so it must be stable
    // whatever separators the analyst typed.
    expect(maskCardNumber('4242 4242 4242 4242')).toBe('424242******4242');
  });
});

describe('withdrawal checks', () => {
  const base = {
    now: new Date('2026-08-31T09:00:00Z'),
    amountMinor: 5000,
    earningsMinor: 12000,
    minimumMinor: 2000,
    cardNumber: '4242424242424242',
    hasPendingRequest: false,
  };

  it('allows a request that satisfies everything', () => {
    expect(checkWithdrawal(base)).toEqual({ allowed: true });
  });

  it('refuses outside the window', () => {
    expect(
      checkWithdrawal({ ...base, now: new Date('2026-08-15T09:00:00Z') }),
    ).toEqual({ allowed: false, reason: 'WINDOW_CLOSED' });
  });

  it('refuses below the minimum', () => {
    expect(checkWithdrawal({ ...base, amountMinor: 500 })).toEqual({
      allowed: false,
      reason: 'BELOW_MINIMUM',
    });
  });

  it('refuses more than has been earned', () => {
    expect(checkWithdrawal({ ...base, amountMinor: 20000 })).toEqual({
      allowed: false,
      reason: 'INSUFFICIENT_EARNINGS',
    });
  });

  it('refuses a card number that fails its check digit', () => {
    expect(
      checkWithdrawal({ ...base, cardNumber: '4242424242424241' }),
    ).toEqual({ allowed: false, reason: 'INVALID_CARD' });
  });

  it('refuses a second request while one is still open', () => {
    expect(checkWithdrawal({ ...base, hasPendingRequest: true })).toEqual({
      allowed: false,
      reason: 'PENDING_REQUEST_EXISTS',
    });
  });

  it('reports the open request before anything else', () => {
    // Somebody with a request in flight should be told that, not told the
    // window is shut, because the window is not what they need to fix.
    expect(
      checkWithdrawal({
        ...base,
        now: new Date('2026-08-15T09:00:00Z'),
        hasPendingRequest: true,
      }),
    ).toEqual({ allowed: false, reason: 'PENDING_REQUEST_EXISTS' });
  });
});

describe('weekly activity', () => {
  // August 2026 in Tbilisi: 31 days, so four whole weeks and three days over.
  const period = payoutPeriod(new Date('2026-08-15T09:00:00Z'));

  /** `day` is the day of the month in Tbilisi; noon keeps it away from edges. */
  function onDay(day: number): Date {
    return new Date(Date.UTC(2026, 7, day, 8, 0, 0));
  }

  function posts(perDay: Record<number, number>): Date[] {
    return Object.entries(perDay).flatMap(([day, count]) =>
      Array.from({ length: count }, () => onDay(Number(day))),
    );
  }

  it('cuts the month into whole seven-day blocks', () => {
    const activity = weeklyActivity({
      period,
      publishedAt: [],
      minimumPerWeek: 10,
    });
    expect(activity.weeks).toBe(4);
    expect(activity.perWeek).toEqual([0, 0, 0, 0]);
  });

  it('passes when every week reaches the minimum', () => {
    const activity = weeklyActivity({
      period,
      publishedAt: posts({ 3: 10, 10: 10, 17: 10, 24: 10 }),
      minimumPerWeek: 10,
    });

    expect(activity.perWeek).toEqual([10, 10, 10, 10]);
    expect(activity.weeksMet).toBe(4);
    expect(activity.passed).toBe(true);
  });

  it('fails a month that was silent for a week, however high the total', () => {
    // Forty posts, which clears any monthly total, but one week is empty.
    const activity = weeklyActivity({
      period,
      publishedAt: posts({ 3: 10, 10: 10, 24: 20 }),
      minimumPerWeek: 10,
    });

    expect(activity.total).toBe(40);
    expect(activity.perWeek).toEqual([10, 10, 0, 20]);
    expect(activity.weeksMet).toBe(3);
    expect(activity.passed).toBe(false);
  });

  it('does not let a burst at the end stand in for the month', () => {
    const activity = weeklyActivity({
      period,
      publishedAt: posts({ 26: 40 }),
      minimumPerWeek: 10,
    });

    expect(activity.passed).toBe(false);
  });

  it('counts the leftover days in the total but does not judge them', () => {
    // Days 29 to 31 fall outside the four whole weeks.
    const activity = weeklyActivity({
      period,
      publishedAt: posts({ 3: 10, 10: 10, 17: 10, 24: 10, 30: 5 }),
      minimumPerWeek: 10,
    });

    expect(activity.remainder).toBe(5);
    expect(activity.total).toBe(45);
    // The stub week is short by five and must not fail anybody.
    expect(activity.passed).toBe(true);
  });

  it('ignores anything published outside the period', () => {
    const activity = weeklyActivity({
      period,
      publishedAt: [
        new Date('2026-07-20T09:00:00Z'),
        new Date('2026-09-05T09:00:00Z'),
        ...posts({ 3: 10, 10: 10, 17: 10, 24: 10 }),
      ],
      minimumPerWeek: 10,
    });

    expect(activity.total).toBe(40);
    expect(activity.passed).toBe(true);
  });

  it('is satisfied by a minimum of zero', () => {
    const activity = weeklyActivity({
      period,
      publishedAt: [],
      minimumPerWeek: 0,
    });
    expect(activity.passed).toBe(true);
  });

  it('does not fail a period too short to hold a whole week', () => {
    const activity = weeklyActivity({
      period: {
        start: new Date('2026-08-01T00:00:00Z'),
        end: new Date('2026-08-04T00:00:00Z'),
      },
      publishedAt: [],
      minimumPerWeek: 10,
    });

    expect(activity.weeks).toBe(0);
    expect(activity.passed).toBe(true);
  });

  it('respects the Tbilisi month boundary', () => {
    // 21:00 UTC on 31 July is already 1 August in Tbilisi, so it is the
    // first week's first day rather than the previous month's.
    const activity = weeklyActivity({
      period,
      publishedAt: [new Date('2026-07-31T21:00:00Z')],
      minimumPerWeek: 10,
    });

    expect(activity.total).toBe(1);
    expect(activity.perWeek[0]).toBe(1);
  });
});
