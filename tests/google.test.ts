import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import {
  decideGoogleLink,
  googleAuthUrl,
  googleConfigured,
  openGoogleProfile,
  sealGoogleProfile,
} from '@/lib/auth/google';

/*
 * The two halves of Google sign-in that do not need Google: the URL the
 * button sends the browser to, and the sealed profile that carries a
 * verified identity from the callback to the confirmation step. The seal
 * is the security boundary - a browser that can forge it can register any
 * mailbox as its own - so tampering and expiry get pinned here.
 */

const KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AUTH_SECRET',
  'APP_URL',
  'DATABASE_URL',
];

function setEnv(values: Record<string, string | undefined>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetEnvCache();
}

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/dajda',
  AUTH_SECRET: 'x'.repeat(32),
  APP_URL: 'https://dajda.ge',
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
};

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  setEnv(BASE);
});
afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('google auth url', () => {
  it('is configured only when both halves are present', () => {
    expect(googleConfigured()).toBe(true);
    setEnv({ ...BASE, GOOGLE_CLIENT_SECRET: undefined });
    // Half a client must refuse to boot, not merely hide the button.
    expect(() => googleConfigured()).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('sends the browser to Google with the exact contract', () => {
    const url = new URL(googleAuthUrl('state-123'));
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe(BASE.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://dajda.ge/api/auth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toContain('email');
  });
});

describe('sealed profile', () => {
  const profile = { sub: 'g-123', email: 'user@example.com', name: 'სახელი' };

  it('round-trips intact', () => {
    expect(openGoogleProfile(sealGoogleProfile(profile))).toEqual(profile);
  });

  it('rejects a tampered payload', () => {
    const sealed = sealGoogleProfile(profile);
    const [payload, sig] = sealed.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'g-999', email: 'attacker@example.com', name: 'x', exp: Date.now() + 60000 }),
    ).toString('base64url');
    expect(openGoogleProfile(`${forged}.${sig}`)).toBeNull();
    expect(openGoogleProfile(`${payload}.AAAA`)).toBeNull();
    expect(openGoogleProfile('garbage')).toBeNull();
  });

  it('expires', () => {
    const sealed = sealGoogleProfile(profile, new Date('2026-01-01T00:00:00Z'));
    expect(
      openGoogleProfile(sealed, new Date('2026-01-01T00:09:00Z')),
    ).toEqual(profile);
    expect(
      openGoogleProfile(sealed, new Date('2026-01-01T00:11:00Z')),
    ).toBeNull();
  });

  it('a different secret cannot open or mint', () => {
    const sealed = sealGoogleProfile(profile);
    setEnv({ ...BASE, AUTH_SECRET: 'y'.repeat(32) });
    expect(openGoogleProfile(sealed)).toBeNull();
  });
});

describe('linking to an existing password account', () => {
  const verified = new Date('2026-01-01T00:00:00Z');

  it('links only when the account has proved it owns the mailbox', () => {
    expect(
      decideGoogleLink({ googleId: null, emailVerifiedAt: verified }),
    ).toBe('LINK');
  });

  it('refuses an unverified account: anyone can register any address', () => {
    // The pre-hijack: attacker registers victim@example.com with a password,
    // victim later signs in with Google. Linking would put the victim inside
    // the attacker's account.
    expect(decideGoogleLink({ googleId: null, emailVerifiedAt: null })).toBe(
      'UNVERIFIED',
    );
  });

  it('refuses an address already bound to another google subject', () => {
    expect(
      decideGoogleLink({ googleId: 'g-other', emailVerifiedAt: verified }),
    ).toBe('TAKEN');
    expect(
      decideGoogleLink({ googleId: 'g-other', emailVerifiedAt: null }),
    ).toBe('TAKEN');
  });
});

describe('private-IP guard', () => {
  it('hides the button when APP_URL is a LAN address Google will refuse', () => {
    setEnv({ ...BASE, APP_URL: 'http://192.168.2.2:3000' });
    expect(googleConfigured()).toBe(false);
  });

  it('allows localhost over http and any https origin', () => {
    setEnv({ ...BASE, APP_URL: 'http://localhost:3000' });
    expect(googleConfigured()).toBe(true);
    setEnv({ ...BASE, APP_URL: 'https://dajda.ge' });
    expect(googleConfigured()).toBe(true);
  });
});
