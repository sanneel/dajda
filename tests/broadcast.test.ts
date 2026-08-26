import { describe, expect, it } from 'vitest';
import {
  allowanceFromUsage,
  BROADCASTS_PER_DAY,
  startOfUtcDay,
} from '@/lib/notifications/broadcast-window';

/**
 * The daily cap's arithmetic, without a database.
 *
 * `broadcastAllowance` itself is a count query; what is worth pinning down
 * here is the day boundary it counts from and the allowance it yields,
 * because that is the part a reader has to trust when the dashboard says
 * "1 of 2 used today".
 */
describe('broadcast day window', () => {
  it('starts the window at UTC midnight', () => {
    const start = startOfUtcDay(new Date('2026-08-24T17:45:12.500Z'));
    expect(start.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('puts a late-evening and an early-morning send in different days', () => {
    const lateYesterday = startOfUtcDay(new Date('2026-08-23T23:59:59Z'));
    const earlyToday = startOfUtcDay(new Date('2026-08-24T00:00:01Z'));
    expect(lateYesterday.toISOString()).not.toBe(earlyToday.toISOString());
  });

  it('treats every instant of one UTC day as the same window', () => {
    const first = startOfUtcDay(new Date('2026-08-24T00:00:00Z'));
    const last = startOfUtcDay(new Date('2026-08-24T23:59:59.999Z'));
    expect(first.getTime()).toBe(last.getTime());
  });

  it('caps at two a day', () => {
    // Stated as a test because it is a promise to recipients, not a tunable.
    expect(BROADCASTS_PER_DAY).toBe(2);
  });
});

describe('broadcast allowance', () => {
  const now = new Date('2026-08-24T10:00:00Z');

  it('counts down from the cap', () => {
    expect(allowanceFromUsage(0, now).remaining).toBe(2);
    expect(allowanceFromUsage(1, now).remaining).toBe(1);
    expect(allowanceFromUsage(2, now).remaining).toBe(0);
  });

  it('never reports a negative allowance', () => {
    // A cap lowered after somebody already sent must read as 0, not as -1.
    expect(allowanceFromUsage(5, now).remaining).toBe(0);
  });

  it('resets at the next UTC midnight', () => {
    expect(allowanceFromUsage(2, now).resetAt.toISOString()).toBe(
      '2026-08-25T00:00:00.000Z',
    );
  });
});
