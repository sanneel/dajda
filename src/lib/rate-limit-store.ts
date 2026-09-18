import { prisma } from '@/lib/db';
import {
  fixedWindow,
  InMemoryRateLimiter,
  verdictFor,
  type RateLimitResult,
  type RateLimitRule,
  type SharedRateLimiter,
} from './rate-limit';

export { RATE_LIMITS } from './rate-limit';

/**
 * The rate limiter every action uses: one counter per key and window, in the
 * database, shared by every instance of the app.
 *
 * The increment is a native upsert (INSERT ... ON CONFLICT DO UPDATE), so two
 * requests racing on the same key both count and neither is lost.
 *
 * If the database cannot be reached the check falls back to this instance's
 * own counter rather than failing open or refusing everyone: a request that
 * needs the limiter usually needs the database next, so an outage stops it
 * there anyway, and a sign-in form that errors for a limiter hiccup would be
 * worse than one briefly guarded per instance.
 */

const fallback = new InMemoryRateLimiter();

/** Roughly one check in a hundred also sweeps dead windows. */
const SWEEP_PROBABILITY = 0.01;

export const rateLimiter: SharedRateLimiter = {
  async check(
    key: string,
    rule: RateLimitRule,
    now: Date = new Date(),
  ): Promise<RateLimitResult> {
    const window = fixedWindow(now, rule.windowMs);
    try {
      const bucket = await prisma.rateLimitBucket.upsert({
        where: {
          key_windowStartMs: { key, windowStartMs: BigInt(window.startMs) },
        },
        create: {
          key,
          windowStartMs: BigInt(window.startMs),
          expiresAtMs: BigInt(window.expiresAtMs),
          count: 1,
        },
        update: { count: { increment: 1 } },
        select: { count: true },
      });

      if (Math.random() < SWEEP_PROBABILITY) {
        void sweepExpiredRateLimits(now).catch(() => undefined);
      }

      return verdictFor(bucket.count, rule, window.expiresAtMs);
    } catch (error) {
      console.error('[dajda] rate limit store unavailable, using in-process counter', error);
      return fallback.check(key, rule, now);
    }
  },

  async reset(key: string): Promise<void> {
    fallback.reset(key);
    try {
      await prisma.rateLimitBucket.deleteMany({ where: { key } });
    } catch (error) {
      console.error('[dajda] rate limit reset failed', error);
    }
  },
};

/** Delete windows that have closed. Returns how many rows went. */
export async function sweepExpiredRateLimits(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAtMs: { lte: BigInt(now.getTime()) } },
  });
  return count;
}
