/**
 * The daily broadcast allowance, as arithmetic.
 *
 * Kept free of Prisma and env imports - like lib/auth/entitlements - so the
 * rule a recipient is actually promised ("at most twice a day, rolling over
 * at midnight") can be asserted in a test without a database.
 *
 * The day boundary is UTC, matching every other date the product renders (see
 * lib/format.ts), so "today" means the same thing in the composer, in the
 * history list and in the check that enforces it.
 */

export const BROADCASTS_PER_DAY = 2;

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export type BroadcastAllowance = {
  used: number;
  remaining: number;
  /** When the count rolls over: the next UTC midnight. */
  resetAt: Date;
};

/** Turn "how many were sent since midnight" into what the UI needs to say. */
export function allowanceFromUsage(
  used: number,
  now: Date = new Date(),
): BroadcastAllowance {
  const since = startOfUtcDay(now);
  return {
    used,
    remaining: Math.max(0, BROADCASTS_PER_DAY - used),
    resetAt: new Date(since.getTime() + 24 * 60 * 60 * 1000),
  };
}
