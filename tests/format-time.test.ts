import { describe, expect, it } from 'vitest';
import { formatDateKa, formatDateTimeKa } from '@/lib/format';
import { nextWithdrawalWindow } from '@/lib/payouts/rules';

/**
 * Dates are shown on the Tbilisi wall clock, not the server's and not UTC.
 *
 * The regression these guard: both formatters read getUTC*, so an instant that
 * IS a Tbilisi midnight - which is what the withdrawal window is - rendered as
 * the previous day, and every evening kickoff lost four hours.
 */
describe('Georgian date formatting', () => {
  it('renders an evening kickoff at its Tbilisi hour', () => {
    // 21:00 in Tbilisi is 17:00 UTC.
    expect(formatDateTimeKa(new Date('2026-08-12T17:00:00Z'))).toBe(
      '12 აგვ 2026, 21:00',
    );
  });

  it('keeps a late-evening instant on its Tbilisi day', () => {
    // 00:30 on the 13th in Tbilisi is still the 12th in UTC.
    expect(formatDateTimeKa(new Date('2026-08-12T20:30:00Z'))).toBe(
      '13 აგვ 2026, 00:30',
    );
  });

  it('shows the withdrawal window on the last day of the month', () => {
    // The window opens at Tbilisi midnight, which is 20:00 UTC the day before.
    // Formatted in UTC that reads as the 30th, which is not the day the
    // agreement promises.
    const now = new Date('2026-08-28T12:00:00Z');
    expect(formatDateKa(nextWithdrawalWindow(now))).toBe('31 აგვ 2026');
  });

  it('carries a year end across correctly', () => {
    const now = new Date('2026-12-31T21:00:00Z'); // 01:00 on 1 Jan in Tbilisi
    expect(formatDateKa(nextWithdrawalWindow(now))).toBe('31 იან 2027');
  });
});
