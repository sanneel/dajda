import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password';
import {
  expiryFrom,
  generateToken,
  hashToken,
  isExpired,
  tokensMatch,
} from '@/lib/auth/tokens';
import {
  applicableTiers,
  isTicketLocked,
  satisfiesVisibility,
} from '@/lib/auth/entitlements';

describe('password hashing', () => {
  it('never stores the password itself', async () => {
    const digest = await hashPassword('CorrectHorse42');
    expect(digest).not.toContain('CorrectHorse42');
    expect(digest.startsWith('scrypt$')).toBe(true);
  });

  it('accepts the correct password', async () => {
    const digest = await hashPassword('CorrectHorse42');
    expect(await verifyPassword('CorrectHorse42', digest)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await hashPassword('CorrectHorse42');
    expect(await verifyPassword('correcthorse42', digest)).toBe(false);
    expect(await verifyPassword('CorrectHorse43', digest)).toBe(false);
    expect(await verifyPassword('', digest)).toBe(false);
  });

  it('salts each digest, so identical passwords differ on disk', async () => {
    const a = await hashPassword('SamePassword1');
    const b = await hashPassword('SamePassword1');
    expect(a).not.toBe(b);
    expect(await verifyPassword('SamePassword1', a)).toBe(true);
    expect(await verifyPassword('SamePassword1', b)).toBe(true);
  });

  it('handles Georgian text and unicode normalisation', async () => {
    const digest = await hashPassword('პაროლი123');
    expect(await verifyPassword('პაროლი123', digest)).toBe(true);
    expect(await verifyPassword('პაროლი124', digest)).toBe(false);
  });

  it('returns false instead of throwing on a malformed digest', async () => {
    // A corrupted row must be a failed login, not a 500.
    for (const bad of [
      '',
      'not-a-digest',
      'scrypt$16384$8$1$onlyfourparts',
      'bcrypt$16384$8$1$c2FsdA$aGFzaA',
      'scrypt$abc$8$1$c2FsdA$aGFzaA',
    ]) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('refuses absurd cost parameters from a tampered digest', async () => {
    // Would otherwise try to allocate an enormous buffer.
    const hostile = `scrypt$1073741824$64$16$c2FsdA$${'a'.repeat(86)}`;
    expect(await verifyPassword('anything', hostile)).toBe(false);
  });

  it('flags weaker digests for rehashing', async () => {
    const current = await hashPassword('CorrectHorse42');
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash('scrypt$1024$8$1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});

describe('opaque tokens', () => {
  it('generates high-entropy, distinct tokens', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateToken()),
    );
    expect(tokens.size).toBe(200);
    // 32 random bytes in base64url.
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically and irreversibly', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('compares hashes safely', () => {
    const hash = hashToken('token');
    expect(tokensMatch(hash, hash)).toBe(true);
    expect(tokensMatch(hash, hashToken('other'))).toBe(false);
    expect(tokensMatch(hash, 'short')).toBe(false);
  });

  it('computes and detects expiry', () => {
    const now = new Date('2026-08-11T00:00:00Z');
    const expires = expiryFrom(now, 60_000);

    expect(expires.getTime()).toBe(now.getTime() + 60_000);
    expect(isExpired(expires, now)).toBe(false);
    expect(isExpired(expires, new Date(now.getTime() + 60_001))).toBe(true);
  });
});

describe('entitlements', () => {
  it('lets anyone read public content', () => {
    expect(satisfiesVisibility([], 'PUBLIC')).toBe(true);
  });

  it('locks premium content for anonymous and free users', () => {
    expect(satisfiesVisibility([], 'PREMIUM')).toBe(false);
    expect(satisfiesVisibility(['FREE'], 'PREMIUM')).toBe(false);
    expect(satisfiesVisibility(['FREE'], 'VIP')).toBe(false);
  });

  it('unlocks premium for premium and above', () => {
    expect(satisfiesVisibility(['PREMIUM'], 'PREMIUM')).toBe(true);
    expect(satisfiesVisibility(['VIP'], 'PREMIUM')).toBe(true);
  });

  /*
   * PREMIUM and VIP are no longer cheap and expensive tiers: they are
   * "buyable on its own" and "subscription only", and ONE subscription opens
   * both. A subscriber locked out of the subscription-only tickets would be
   * locked out of the thing they subscribed for.
   */
  it('lets a subscription unlock subscription-only content', () => {
    expect(satisfiesVisibility(['PREMIUM'], 'VIP')).toBe(true);
    expect(satisfiesVisibility(['VIP'], 'VIP')).toBe(true);
    expect(satisfiesVisibility(['FREE'], 'VIP')).toBe(false);
  });

  it('never conflates FREE with PUBLIC', () => {
    // FREE is a plan; PUBLIC is a visibility. Holding FREE grants nothing gated.
    expect(satisfiesVisibility(['FREE'], 'PREMIUM')).toBe(false);
  });

  it('scopes analyst plans to that analyst only', () => {
    const plans = [
      { tier: 'VIP' as const, analystProfileId: 'analyst-a' },
      { tier: 'FREE' as const, analystProfileId: null },
    ];

    expect(applicableTiers(plans, 'analyst-a')).toEqual(['VIP', 'FREE']);
    // Analyst B's content must not be unlocked by analyst A's plan.
    expect(applicableTiers(plans, 'analyst-b')).toEqual(['FREE']);
    expect(
      satisfiesVisibility(applicableTiers(plans, 'analyst-b'), 'PREMIUM'),
    ).toBe(false);
    expect(
      satisfiesVisibility(applicableTiers(plans, 'analyst-a'), 'VIP'),
    ).toBe(true);
  });

  it('lets a platform-wide plan unlock every analyst', () => {
    const plans = [{ tier: 'PREMIUM' as const, analystProfileId: null }];
    expect(
      satisfiesVisibility(applicableTiers(plans, 'anyone'), 'PREMIUM'),
    ).toBe(true);
  });
});

describe('ticket lock', () => {
  const openPaidBet = {
    visibility: 'PREMIUM' as const,
    authorId: 'analyst-a',
    status: 'PENDING' as const,
  };

  it('closes an open paid bet to signed-out and unentitled viewers', () => {
    expect(isTicketLocked(openPaidBet, null, [])).toBe(true);
    expect(
      isTicketLocked(
        openPaidBet,
        { role: 'USER', analystProfileId: null },
        [{ tier: 'FREE', analystProfileId: null }],
      ),
    ).toBe(true);
  });

  it('opens it to a matching subscription', () => {
    expect(
      isTicketLocked(
        openPaidBet,
        { role: 'USER', analystProfileId: null },
        [{ tier: 'PREMIUM', analystProfileId: 'analyst-a' }],
      ),
    ).toBe(false);
    // Another analyst's plan buys nothing here.
    expect(
      isTicketLocked(
        openPaidBet,
        { role: 'USER', analystProfileId: null },
        [{ tier: 'VIP', analystProfileId: 'analyst-b' }],
      ),
    ).toBe(true);
  });

  it('never locks a settled bet: the pick becomes public record', () => {
    for (const status of ['WON', 'LOST', 'VOID', 'PUSH'] as const) {
      expect(isTicketLocked({ ...openPaidBet, status }, null, [])).toBe(false);
      expect(
        isTicketLocked(
          { ...openPaidBet, visibility: 'PUBLIC', status },
          null,
          [],
        ),
      ).toBe(false);
    }
  });

  it('asks signed-out viewers for an account even on open free tickets', () => {
    expect(
      isTicketLocked({ ...openPaidBet, visibility: 'PUBLIC' }, null, []),
    ).toBe(true);
    expect(isTicketLocked({ ...openPaidBet, authorId: null }, null, [])).toBe(
      true,
    );
  });

  it('opens free and community tickets to any signed-in account', () => {
    const viewer = { role: 'USER' as const, analystProfileId: null };
    expect(
      isTicketLocked({ ...openPaidBet, visibility: 'PUBLIC' }, viewer, []),
    ).toBe(false);
    expect(
      isTicketLocked({ ...openPaidBet, authorId: null }, viewer, []),
    ).toBe(false);
  });

  it('never locks the author or an admin out of the pick', () => {
    expect(
      isTicketLocked(
        openPaidBet,
        { role: 'ANALYST', analystProfileId: 'analyst-a' },
        [],
      ),
    ).toBe(false);
    expect(
      isTicketLocked(openPaidBet, { role: 'ADMIN', analystProfileId: null }, []),
    ).toBe(false);
  });
});
