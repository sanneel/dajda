import { describe, expect, it } from 'vitest';
import { isPermanentStatus } from '@/lib/notifications/email/types';
import { parseSender } from '@/lib/notifications/email/brevo';

/**
 * The two decisions in the email path that are not "call fetch": whether a
 * failure is worth retrying, and how a From address is split for providers
 * that want it in pieces. Both are pure, so both are pinned down here.
 */
describe('retry classification', () => {
  it('does not retry a refusal', () => {
    // The provider understood and said no; repeating it only burns quota.
    expect(isPermanentStatus(400)).toBe(true);
    expect(isPermanentStatus(401)).toBe(true);
    expect(isPermanentStatus(403)).toBe(true);
    expect(isPermanentStatus(422)).toBe(true);
  });

  it('retries rate limiting, which is an explicit "try later"', () => {
    expect(isPermanentStatus(429)).toBe(false);
  });

  it('retries provider-side failures', () => {
    expect(isPermanentStatus(500)).toBe(false);
    expect(isPermanentStatus(502)).toBe(false);
    expect(isPermanentStatus(503)).toBe(false);
  });
});

describe('sender parsing', () => {
  it('splits a named address', () => {
    expect(parseSender('DAJDA <no-reply@dajda.ge>')).toEqual({
      name: 'DAJDA',
      email: 'no-reply@dajda.ge',
    });
  });

  it('accepts a bare address', () => {
    expect(parseSender('no-reply@dajda.ge')).toEqual({
      email: 'no-reply@dajda.ge',
    });
  });

  it('strips quotes and surrounding space from the display name', () => {
    expect(parseSender('  "DAJDA ანალიზი"  <no-reply@dajda.ge> ')).toEqual({
      name: 'DAJDA ანალიზი',
      email: 'no-reply@dajda.ge',
    });
  });

  it('omits the name rather than sending an empty one', () => {
    // Brevo rejects a sender whose name is present but blank.
    expect(parseSender('<no-reply@dajda.ge>')).toEqual({
      email: 'no-reply@dajda.ge',
    });
  });
});
