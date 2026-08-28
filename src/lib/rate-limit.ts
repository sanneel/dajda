/**
 * Fixed-window rate limiting.
 *
 * SCOPE: this is an in-process counter. It protects a single server instance
 * and is intentionally simple - behind multiple instances the effective limit
 * multiplies by the instance count. The `RateLimiter` interface exists so a
 * Redis-backed implementation can be dropped in without touching call sites.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** When the current window resets. */
  resetAt: Date;
};

export type RateLimitRule = {
  /** Maximum attempts permitted inside the window. */
  limit: number;
  windowMs: number;
};

export interface RateLimiter {
  check(key: string, rule: RateLimitRule, now?: Date): RateLimitResult;
  reset(key: string): void;
}

type Bucket = { count: number; expiresAt: number };

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  /** Bound the map so a flood of distinct keys cannot exhaust memory. */
  private readonly maxKeys: number;

  constructor(maxKeys = 10_000) {
    this.maxKeys = maxKeys;
  }

  check(key: string, rule: RateLimitRule, now: Date = new Date()): RateLimitResult {
    const timestamp = now.getTime();
    this.evictExpired(timestamp);

    const existing = this.buckets.get(key);

    if (!existing || existing.expiresAt <= timestamp) {
      if (this.buckets.size >= this.maxKeys) {
        this.buckets.delete(this.buckets.keys().next().value as string);
      }
      const expiresAt = timestamp + rule.windowMs;
      this.buckets.set(key, { count: 1, expiresAt });
      return {
        allowed: true,
        remaining: rule.limit - 1,
        resetAt: new Date(expiresAt),
      };
    }

    existing.count += 1;
    return {
      allowed: existing.count <= rule.limit,
      remaining: Math.max(0, rule.limit - existing.count),
      resetAt: new Date(existing.expiresAt),
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private evictExpired(timestamp: number): void {
    if (this.buckets.size < this.maxKeys / 2) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= timestamp) this.buckets.delete(key);
    }
  }
}

/** Tuned for credential endpoints: slow enough to make guessing pointless. */
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Each resend is an outbound email on the platform's reputation. */
  resendVerification: { limit: 3, windowMs: 15 * 60 * 1000 },
  /**
   * Guessing attempts against the 6 digit mail code. The strictness is the
   * security: a million-combination code is only safe while trying them is
   * this slow.
   */
  verifyEmailCode: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** An application decodes an image and is reviewed by a person. */
  analystApplication: { limit: 3, windowMs: 60 * 60 * 1000 },
  /** A withdrawal moves money and is reviewed by a person. */
  withdrawal: { limit: 5, windowMs: 60 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 60 * 1000 },
  checkout: { limit: 10, windowMs: 10 * 60 * 1000 },
  /** Each post decodes and re-encodes an image, so it is worth capping. */
  postBet: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Text posts are cheap, but a live session is a rapid stream of them. */
  feedPost: { limit: 120, windowMs: 60 * 60 * 1000 },
  /**
   * A live announcement fans out to every subscriber's inbox, so it is the one
   * action here whose cost is paid by other people. Capped hard.
   */
  liveNotice: { limit: 6, windowMs: 12 * 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export const rateLimiter: RateLimiter = new InMemoryRateLimiter();
