import { describe, expect, it } from 'vitest';
import { analystShareMinor } from '@/lib/balance/ledger';
import { AppError, ERROR_CODES, errorDiagnostic } from '@/lib/errors';
import {
  checkWithdrawal,
  daysInMonth,
  ibanValid,
  isWithdrawalWindowOpen,
  maskIban,
  nextWithdrawalWindow,
  normaliseIban,
  payoutPeriod,
  monthlyActivity,
  PLATFORM_MONTHLY_MINIMUM,
  tbilisiParts,
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

describe('withdrawal window override', () => {
  const midMonth = new Date('2026-08-15T09:00:00Z');
  const lastDay = new Date('2026-08-31T09:00:00Z');

  it('opens any day when an administrator says so', () => {
    expect(isWithdrawalWindowOpen(midMonth, 'OPEN')).toBe(true);
  });

  it('closes the last day when an administrator says so', () => {
    expect(isWithdrawalWindowOpen(lastDay, 'CLOSED')).toBe(false);
  });

  it('falls back to the calendar without one', () => {
    expect(isWithdrawalWindowOpen(midMonth, 'SCHEDULE')).toBe(false);
    expect(isWithdrawalWindowOpen(lastDay, 'SCHEDULE')).toBe(true);
    expect(isWithdrawalWindowOpen(lastDay)).toBe(true);
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

describe('IBAN handling', () => {
  // GE95TB0000000123456789 and GE61TB7777777777777777 both satisfy mod-97.
  it('accepts a valid account, spaces and all', () => {
    expect(ibanValid('GE95TB0000000123456789')).toBe(true);
    expect(ibanValid('GE95 TB00 0000 0123 4567 89')).toBe(true);
    expect(ibanValid('ge95tb0000000123456789')).toBe(true);
  });

  it('rejects a mistyped character', () => {
    expect(ibanValid('GE94TB0000000123456789')).toBe(false);
    expect(ibanValid('GE95TB0000000123456798')).toBe(false);
  });

  it('rejects lengths no Georgian IBAN has', () => {
    expect(ibanValid('GE95TB00000001234567')).toBe(false);
    expect(ibanValid('GE95TB000000012345678901')).toBe(false);
  });

  /*
   * Flitt credits an IBAN in GEL and nothing else, so a foreign account would
   * be refused at the gateway after the earnings had already been held.
   */
  it('rejects an account outside Georgia even when its check digits are right', () => {
    expect(ibanValid('GB82WEST12345698765432')).toBe(false);
    expect(ibanValid('DE89370400440532013000')).toBe(false);
  });

  it('strips separators and upper-cases before checking', () => {
    expect(normaliseIban('ge95-tb00 0000 0123.456789')).toBe(
      'GE95TB0000000123456789',
    );
  });

  it('keeps the country code, the check digits and the last four when masking', () => {
    expect(maskIban('GE95TB0000000123456789')).toBe('GE95**************6789');
    // The mask is what identifies the account later, so it must be stable
    // whatever the analyst typed.
    expect(maskIban('ge95 tb00 0000 0123 4567 89')).toBe('GE95**************6789');
  });
});

describe('withdrawal checks', () => {
  const base = {
    now: new Date('2026-08-31T09:00:00Z'),
    amountMinor: 5000,
    earningsMinor: 12000,
    minimumMinor: 2000,
    iban: 'GE95TB0000000123456789',
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

  it('refuses an account that fails its check digits', () => {
    expect(
      checkWithdrawal({ ...base, iban: 'GE94TB0000000123456789' }),
    ).toEqual({ allowed: false, reason: 'INVALID_IBAN' });
  });

  it('refuses a second request while one is still open', () => {
    expect(checkWithdrawal({ ...base, hasPendingRequest: true })).toEqual({
      allowed: false,
      reason: 'PENDING_REQUEST_EXISTS',
    });
  });

  it('lets an administrator open the window on any day', () => {
    expect(
      checkWithdrawal({
        ...base,
        now: new Date('2026-08-15T09:00:00Z'),
        override: 'OPEN',
      }),
    ).toEqual({ allowed: true });
  });

  it('lets an administrator hold the window shut on the last day', () => {
    // The calendar says yes here; the override is the whole point.
    expect(checkWithdrawal({ ...base, override: 'CLOSED' })).toEqual({
      allowed: false,
      reason: 'WINDOW_HELD',
    });
  });

  it('separates a held window from a merely closed one', () => {
    // Two different sentences for the author: one can be waited out, the
    // other cannot, and telling a held author to come back on the 31st
    // would send them away for nothing.
    expect(
      checkWithdrawal({
        ...base,
        now: new Date('2026-08-15T09:00:00Z'),
        override: 'CLOSED',
      }),
    ).toEqual({ allowed: false, reason: 'WINDOW_HELD' });
  });

  it('still refuses an opened window everything else fails', () => {
    // The override moves WHEN, never WHETHER. Every other guard survives it.
    expect(
      checkWithdrawal({ ...base, override: 'OPEN', amountMinor: 20000 }),
    ).toEqual({ allowed: false, reason: 'INSUFFICIENT_EARNINGS' });
    expect(
      checkWithdrawal({ ...base, override: 'OPEN', hasPendingRequest: true }),
    ).toEqual({ allowed: false, reason: 'PENDING_REQUEST_EXISTS' });
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

describe('monthly activity', () => {
  // August 2026 in Tbilisi starts on a Saturday: the full Monday-to-Sunday
  // weeks are 3-9, 10-16, 17-23 and 24-30, and the 1st, 2nd and 31st fall
  // outside them.
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

  it('finds the full calendar weeks of the month', () => {
    const activity = monthlyActivity({ period, publishedAt: [], declaredMinimum: 8 });
    expect(activity.weeks).toBe(4);
    expect(activity.perWeek).toEqual([0, 0, 0, 0]);
  });

  it('passes when the declared total is reached and no full week is empty', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: posts({ 3: 2, 10: 2, 17: 2, 24: 2 }),
      declaredMinimum: 8,
    });
    expect(activity.total).toBe(8);
    expect(activity.emptyWeeks).toBe(0);
    expect(activity.passed).toBe(true);
  });

  it('judges against the number the author declared, not a fixed quota', () => {
    const published = posts({ 3: 3, 10: 3, 17: 3, 24: 3 });
    expect(
      monthlyActivity({ period, publishedAt: published, declaredMinimum: 12 }).passed,
    ).toBe(true);
    expect(
      monthlyActivity({ period, publishedAt: published, declaredMinimum: 20 }).passed,
    ).toBe(false);
  });

  it('fails a month with a silent full week, however high the total', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: posts({ 3: 10, 10: 10, 24: 20 }),
      declaredMinimum: 8,
    });
    expect(activity.total).toBe(40);
    expect(activity.perWeek).toEqual([10, 10, 0, 20]);
    expect(activity.emptyWeeks).toBe(1);
    expect(activity.passed).toBe(false);
  });

  it('does not let a burst at the end stand in for the month', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: posts({ 26: 40 }),
      declaredMinimum: 8,
    });
    expect(activity.passed).toBe(false);
  });

  it('counts days outside the full weeks in the total without judging them', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: posts({ 1: 5, 3: 1, 10: 1, 17: 1, 24: 1, 31: 5 }),
      declaredMinimum: 14,
    });
    expect(activity.total).toBe(14);
    expect(activity.perWeek).toEqual([1, 1, 1, 1]);
    expect(activity.passed).toBe(true);
  });

  it('holds a profile that never declared a number to the platform floor', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: posts({ 3: 1, 10: 1, 17: 1, 24: 1 }),
      declaredMinimum: null,
    });
    expect(activity.declaredMinimum).toBe(PLATFORM_MONTHLY_MINIMUM);
    expect(activity.passed).toBe(false);
  });

  it('never accepts a declared number below the platform floor', () => {
    expect(
      monthlyActivity({ period, publishedAt: [], declaredMinimum: 2 }).declaredMinimum,
    ).toBe(PLATFORM_MONTHLY_MINIMUM);
  });

  it('ignores anything published outside the period', () => {
    const activity = monthlyActivity({
      period,
      publishedAt: [
        new Date('2026-07-20T09:00:00Z'),
        new Date('2026-09-05T09:00:00Z'),
        ...posts({ 3: 2, 10: 2, 17: 2, 24: 2 }),
      ],
      declaredMinimum: 8,
    });
    expect(activity.total).toBe(8);
    expect(activity.passed).toBe(true);
  });

  it('puts a week boundary where Tbilisi puts it, not UTC', () => {
    // 20:30 UTC on Sunday 9 August is already 00:30 on Monday 10 August.
    const activity = monthlyActivity({
      period,
      publishedAt: [new Date('2026-08-09T20:30:00Z')],
      declaredMinimum: 8,
    });
    expect(activity.perWeek).toEqual([0, 1, 0, 0]);
  });
});

describe('payout failure diagnosis', () => {
  /*
   * The regression this guards: a payout refused by Flitt was recorded as
   * "გადახდის დამუშავება ვერ მოხერხდა." because the failure path read
   * `error.message`, which on an AppError is the client-safe fallback. The
   * reason the gateway gave sat in `internalDetail` and reached neither the row
   * nor the log, so a real failed withdrawal could not be explained afterwards.
   */
  it('prefers the internal detail over the client-safe message', () => {
    const error = new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
      internalDetail: 'Flitt payout failed: 1014 Invalid signature',
    });

    expect(error.message).toBe('გადახდის დამუშავება ვერ მოხერხდა.');
    expect(errorDiagnostic(error)).toBe(
      'PAYMENT_ERROR: Flitt payout failed: 1014 Invalid signature',
    );
  });

  it('names the code when an AppError carries no detail', () => {
    expect(errorDiagnostic(new AppError(ERROR_CODES.CONFLICT))).toBe(
      'CONFLICT: ეს მოქმედება ეწინააღმდეგება არსებულ ჩანაწერს.',
    );
  });

  it('keeps a plain error identifiable', () => {
    expect(errorDiagnostic(new TypeError('fetch failed'))).toBe(
      'TypeError: fetch failed',
    );
  });

  it('does not throw on a value that is not an error at all', () => {
    expect(errorDiagnostic('ECONNRESET')).toBe('ECONNRESET');
    expect(errorDiagnostic(undefined)).toBe('undefined');
  });
});
