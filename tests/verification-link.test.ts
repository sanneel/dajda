import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { verificationLinkWhenUnsent } from '@/lib/auth/mail';

/*
 * The escape hatch that lets registration be tested before a mail provider
 * exists, and the reason it is not a hole.
 *
 * It hands the caller a live verification token. That is only acceptable
 * because it is handed to the account the token belongs to, and only on a
 * deployment where nothing is sending mail. The second half is what these
 * tests pin: the moment a real provider is configured, the link must be null
 * and the token must live nowhere but the message.
 */

const KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'AUTH_SECRET',
  'APP_URL',
  'PAYMENT_PROVIDER',
  'MOCK_PAYMENT_SECRET',
  'EMAIL_PROVIDER',
  'EMAIL_API_KEY',
  'EMAIL_FROM',
  'DEMO_MODE',
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
};

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
});
afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('verification link exposure', () => {
  it('returns the link when nothing is sending mail', () => {
    setEnv({ ...BASE, EMAIL_PROVIDER: 'log' });
    expect(verificationLinkWhenUnsent('tok123')).toBe(
      'https://dajda.ge/verify-email?token=tok123',
    );
  });

  it('is the default, so a fresh checkout can test registration', () => {
    // EMAIL_PROVIDER unset falls back to "log".
    setEnv(BASE);
    expect(verificationLinkWhenUnsent('tok123')).not.toBeNull();
  });

  it('returns nothing once a real provider is configured', () => {
    setEnv({
      ...BASE,
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 're_test_key',
      EMAIL_FROM: 'DAJDA <no-reply@dajda.ge>',
    });
    expect(verificationLinkWhenUnsent('tok123')).toBeNull();
  });

  it('returns nothing for the other real provider either', () => {
    setEnv({
      ...BASE,
      EMAIL_PROVIDER: 'brevo',
      EMAIL_API_KEY: 'xkeysib-test',
      EMAIL_FROM: 'DAJDA <no-reply@dajda.ge>',
    });
    expect(verificationLinkWhenUnsent('tok123')).toBeNull();
  });

  it('cannot appear on a production deployment, because "log" is refused there', () => {
    setEnv({
      ...BASE,
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'flitt',
      EMAIL_PROVIDER: 'log',
    });
    expect(() => verificationLinkWhenUnsent('tok123')).toThrow(
      /EMAIL_PROVIDER/,
    );
  });
});
