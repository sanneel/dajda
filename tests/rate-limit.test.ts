import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, RATE_LIMITS } from '@/lib/rate-limit';

describe('rate limiting', () => {
  const rule = { limit: 3, windowMs: 60_000 };
  const start = new Date('2026-08-11T00:00:00Z');
  const at = (ms: number) => new Date(start.getTime() + ms);

  it('allows requests up to the limit', () => {
    const limiter = new InMemoryRateLimiter();

    expect(limiter.check('k', rule, start).allowed).toBe(true);
    expect(limiter.check('k', rule, start).allowed).toBe(true);
    expect(limiter.check('k', rule, start).allowed).toBe(true);
  });

  it('blocks the request after the limit is reached', () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < rule.limit; i += 1) limiter.check('k', rule, start);

    const blocked = limiter.check('k', rule, start);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('counts each key independently', () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < rule.limit; i += 1) limiter.check('a', rule, start);

    expect(limiter.check('a', rule, start).allowed).toBe(false);
    // A different address or account must not inherit the block.
    expect(limiter.check('b', rule, start).allowed).toBe(true);
  });

  it('resets once the window has elapsed', () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < rule.limit + 2; i += 1) limiter.check('k', rule, start);

    expect(limiter.check('k', rule, at(rule.windowMs - 1)).allowed).toBe(false);
    expect(limiter.check('k', rule, at(rule.windowMs + 1)).allowed).toBe(true);
  });

  it('reports the remaining allowance and reset time', () => {
    const limiter = new InMemoryRateLimiter();
    const first = limiter.check('k', rule, start);

    expect(first.remaining).toBe(rule.limit - 1);
    expect(first.resetAt.getTime()).toBe(start.getTime() + rule.windowMs);
  });

  it('can be reset explicitly after a successful login', () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < rule.limit; i += 1) limiter.check('k', rule, start);
    expect(limiter.check('k', rule, start).allowed).toBe(false);

    limiter.reset('k');
    expect(limiter.check('k', rule, start).allowed).toBe(true);
  });

  it('bounds memory so distinct keys cannot exhaust it', () => {
    const limiter = new InMemoryRateLimiter(10);
    for (let i = 0; i < 500; i += 1) {
      limiter.check(`key-${i}`, rule, start);
    }
    // Still answering correctly after far more keys than its capacity.
    expect(limiter.check('key-final', rule, start).allowed).toBe(true);
  });

  it('configures credential endpoints restrictively', () => {
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.login.windowMs).toBeGreaterThanOrEqual(60_000);
    expect(RATE_LIMITS.passwordReset.limit).toBeLessThanOrEqual(10);
  });
});
