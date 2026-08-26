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
    expect(analystShareMinor(3000, 70)).toBe(2100);
    expect(analystShareMinor(5000, 50)).toBe(2500);
  });

  it('rounds down, so the platform never owes out more than it took', () => {
    // 70% of 2999 is 2099.3
    expect(analystShareMinor(2999, 70)).toBe(2099);
  });

  it('handles the ends of the range', () => {
    expect(analystShareMinor(3000, 0)).toBe(0);
    expect(analystShareMinor(3000, 100)).toBe(3000);
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
