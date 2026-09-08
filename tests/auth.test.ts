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
  holdsSubscriptionTo,
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
  it('opens nothing to a viewer with no plan at all', () => {
    expect(holdsSubscriptionTo([], 'analyst-a')).toBe(false);
  });

  it('never conflates FREE with a paid plan', () => {
    // FREE is a plan somebody can hold without paying, so it is not a key.
    expect(
      holdsSubscriptionTo([{ tier: 'FREE', analystProfileId: null }], 'analyst-a'),
    ).toBe(false);
  });

  it('accepts any paying plan that covers the author', () => {
    expect(
      holdsSubscriptionTo(
        [{ tier: 'PREMIUM', analystProfileId: 'analyst-a' }],
        'analyst-a',
      ),
    ).toBe(true);
    expect(
      holdsSubscriptionTo(
        [{ tier: 'VIP', analystProfileId: 'analyst-a' }],
        'analyst-a',
      ),
    ).toBe(true);
  });

  it('scopes analyst plans to that analyst only', () => {
    const plans = [
      { tier: 'VIP' as const, analystProfileId: 'analyst-a' },
      { tier: 'FREE' as const, analystProfileId: null },
    ];

    expect(applicableTiers(plans, 'analyst-a')).toEqual(['VIP', 'FREE']);
    // Analyst B's content must not be unlocked by analyst A's plan.
    expect(applicableTiers(plans, 'analyst-b')).toEqual(['FREE']);
    expect(holdsSubscriptionTo(plans, 'analyst-a')).toBe(true);
    expect(holdsSubscriptionTo(plans, 'analyst-b')).toBe(false);
  });

  it('lets a platform-wide paid plan cover every analyst', () => {
    const plans = [{ tier: 'PREMIUM' as const, analystProfileId: null }];
    expect(holdsSubscriptionTo(plans, 'anyone')).toBe(true);
  });
});

describe('ticket lock', () => {
  const paidSingle = {
    visibility: 'PREMIUM' as const,
    authorId: 'analyst-a',
    status: 'PENDING' as const,
  };
  const subscriberOnly = { ...paidSingle, visibility: 'VIP' as const };
  const stranger = { role: 'USER' as const, analystProfileId: null };
  const subToA = [{ tier: 'PREMIUM' as const, analystProfileId: 'analyst-a' }];

  it('closes a paid ticket to signed-out and unentitled viewers', () => {
    expect(isTicketLocked(paidSingle, null, [])).toBe(true);
    expect(
      isTicketLocked(paidSingle, stranger, [
        { tier: 'FREE', analystProfileId: null },
      ]),
    ).toBe(true);
  });

  /*
   * The whole point of the 2026-09-08 rule. A single ticket is its own sale:
   * the author's subscribers did not buy it, so it does not open for them.
   */
  it('opens a singly-sold ticket ONLY to whoever bought that ticket', () => {
    expect(isTicketLocked(paidSingle, stranger, [], true)).toBe(false);
    // A subscription to this very author is not a key to it.
    expect(isTicketLocked(paidSingle, stranger, subToA)).toBe(true);
  });

  it('opens a subscription-only ticket ONLY to a subscriber', () => {
    expect(isTicketLocked(subscriberOnly, stranger, subToA)).toBe(false);
    expect(isTicketLocked(subscriberOnly, stranger, [])).toBe(true);
    // Another analyst's subscription buys nothing here.
    expect(
      isTicketLocked(subscriberOnly, stranger, [
        { tier: 'VIP', analystProfileId: 'analyst-b' },
      ]),
    ).toBe(true);
  });

  /*
   * Settling used to open every pick, on the theory that a hidden history is
   * not checkable. It also handed the buyer's purchase to everybody who
   * waited a day. The record stays checkable through the rows around the
   * pick - odds, date, outcome - which are never hidden.
   */
  it('keeps a paid ticket shut after it settles', () => {
    for (const status of ['WON', 'LOST', 'VOID', 'PUSH'] as const) {
      expect(isTicketLocked({ ...paidSingle, status }, null, [])).toBe(true);
      expect(isTicketLocked({ ...paidSingle, status }, stranger, [])).toBe(true);
      expect(isTicketLocked({ ...subscriberOnly, status }, stranger, [])).toBe(
        true,
      );
      // The buyer keeps what they bought, for good.
      expect(
        isTicketLocked({ ...paidSingle, status }, stranger, [], true),
      ).toBe(false);
    }
  });

  it('still opens a settled free ticket to everyone', () => {
    for (const status of ['WON', 'LOST', 'VOID', 'PUSH'] as const) {
      expect(
        isTicketLocked({ ...paidSingle, visibility: 'PUBLIC', status }, null, []),
      ).toBe(false);
      expect(
        isTicketLocked({ ...paidSingle, authorId: null, status }, null, []),
      ).toBe(false);
    }
  });

  it('asks signed-out viewers for an account on open free tickets', () => {
    expect(
      isTicketLocked({ ...paidSingle, visibility: 'PUBLIC' }, null, []),
    ).toBe(true);
    expect(isTicketLocked({ ...paidSingle, authorId: null }, null, [])).toBe(
      true,
    );
  });

  it('opens free and community tickets to any signed-in account', () => {
    expect(
      isTicketLocked({ ...paidSingle, visibility: 'PUBLIC' }, stranger, []),
    ).toBe(false);
    expect(isTicketLocked({ ...paidSingle, authorId: null }, stranger, [])).toBe(
      false,
    );
  });

  it('never locks the author or an admin out of the pick', () => {
    for (const ticket of [paidSingle, subscriberOnly]) {
      expect(
        isTicketLocked(
          ticket,
          { role: 'ANALYST', analystProfileId: 'analyst-a' },
          [],
        ),
      ).toBe(false);
      expect(
        isTicketLocked(ticket, { role: 'ADMIN', analystProfileId: null }, []),
      ).toBe(false);
    }
  });
});
