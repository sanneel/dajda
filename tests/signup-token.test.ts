import { describe, expect, it } from 'vitest';
import { openSignup, sealSignup } from '@/lib/auth/signup-token';

/*
 * The confirmation link carries the whole sign-up, encrypted: the account is
 * only created when the mailbox's owner opens it, which is what keeps the
 * registration form from revealing whether an address is taken.
 */
describe('pending sign-up token', () => {
  const secret = 'a'.repeat(40);
  const pending = {
    name: 'ნინო',
    email: 'nino@example.ge',
    passwordDigest: 'scrypt$16384$8$1$salt$hash',
  };

  it('round-trips the sign-up', () => {
    expect(openSignup(sealSignup(pending, secret), secret)).toEqual(pending);
  });

  it('does not reveal the details in the link', () => {
    const token = sealSignup(pending, secret);
    const bytes = Buffer.from(token, 'base64url').toString('latin1');
    expect(bytes).not.toContain('nino@example.ge');
    expect(bytes).not.toContain('scrypt');
  });

  it('refuses an altered link', () => {
    const token = sealSignup(pending, secret);
    const raw = Buffer.from(token, 'base64url');
    raw.writeUInt8(raw.readUInt8(raw.length - 1) ^ 1, raw.length - 1);
    expect(openSignup(raw.toString('base64url'), secret)).toBeNull();
  });

  it('refuses a link sealed with another secret', () => {
    expect(openSignup(sealSignup(pending, secret), 'b'.repeat(40))).toBeNull();
  });

  it('expires after a day', () => {
    const issued = new Date('2026-09-24T10:00:00Z');
    const token = sealSignup(pending, secret, issued);
    expect(openSignup(token, secret, new Date('2026-09-25T09:59:00Z'))).toEqual(pending);
    expect(openSignup(token, secret, new Date('2026-09-25T10:00:01Z'))).toBeNull();
  });

  it('refuses garbage', () => {
    expect(openSignup('', secret)).toBeNull();
    expect(openSignup('not-a-token', secret)).toBeNull();
  });
});
