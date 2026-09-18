/**
 * Fixed-window rate limiting: the rules, the window arithmetic, and an
 * in-process counter.
 *
 * The counter the app actually uses is the database one in
 * ./rate-limit-store, because the app runs as many instances and an
 * in-process counter is one counter per instance. The in-memory one stays as
 * that store's fallback when the database cannot be reached, and for tests.
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
  /**
   * Redeeming a reset or verification link. The tokens are 256 random bits,
   * so this is not what makes them unguessable; it stops one address from
   * hammering the lookup.
   */
  tokenRedeem: { limit: 20, windowMs: 15 * 60 * 1000 },
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
  /** Changing a photograph decodes an image; generous, but not unbounded. */
  analystPhoto: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** A withdrawal moves money and is reviewed by a person. */
  withdrawal: { limit: 5, windowMs: 60 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 60 * 1000 },
  checkout: { limit: 10, windowMs: 10 * 60 * 1000 },
  /** Each post decodes and re-encodes an image, so it is worth capping. */
  postBet: { limit: 30, windowMs: 60 * 60 * 1000 },
  feedPost: { limit: 120, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * The window a moment falls in, for a fixed-window rule. Every instance
 * computes the same start for the same moment, which is what lets them share
 * one counter (see ./rate-limit-store).
 */
export function fixedWindow(
  now: Date,
  windowMs: number,
): { startMs: number; expiresAtMs: number } {
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return { startMs, expiresAtMs: startMs + windowMs };
}

/** What a counter reading means for the caller. */
export function verdictFor(
  count: number,
  rule: RateLimitRule,
  expiresAtMs: number,
): RateLimitResult {
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: new Date(expiresAtMs),
  };
}

/** A limiter whose counter lives somewhere other than this process. */
export interface SharedRateLimiter {
  check(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}
