import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnv, resetEnvCache } from '@/lib/env';

/*
 * These are security tests, not configuration tests.
 *
 * Every default the schema carries is safe on a laptop and unsafe on a public
 * host, and each one fails silently - the app boots and serves traffic while
 * being wrong. The guard exists so that a forgotten variable stops a deploy
 * instead of quietly handing out free subscriptions or dropping the Secure
 * flag from session cookies.
 */

const VALID_PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/dajda',
  AUTH_SECRET: 'x'.repeat(32),
  APP_URL: 'https://dajda.ge',
  PAYMENT_PROVIDER: 'flitt',
  MOCK_PAYMENT_SECRET: 'not-the-shared-default',
  FLITT_MERCHANT_ID: '1000',
  FLITT_SECRET_KEY: 'flitt-secret',
  EMAIL_PROVIDER: 'resend',
  EMAIL_API_KEY: 're_test_key',
  EMAIL_FROM: 'DAJDA <no-reply@dajda.ge>',
} as const;

/** Replaces the whole environment so a stray real variable cannot leak in. */
function setEnv(values: Record<string, string | undefined>) {
  for (const key of Object.keys(VALID_PRODUCTION)) delete process.env[key];
  delete process.env.DEMO_MODE;
  delete process.env.NEXT_PHASE;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
}

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
});

afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('environment configuration', () => {
  it('accepts a fully configured production environment', () => {
    setEnv(VALID_PRODUCTION);
    expect(getEnv().APP_URL).toBe('https://dajda.ge');
  });

  it('refuses to boot production with the mock payment provider', () => {
    // The mock provider exposes /dev/checkout and a signed-webhook simulator.
    setEnv({ ...VALID_PRODUCTION, PAYMENT_PROVIDER: 'mock' });
    expect(() => getEnv()).toThrow(/PAYMENT_PROVIDER/);
  });

  /*
   * DEMO_MODE is the one sanctioned way past the payment and email guards.
   * These tests pin its blast radius: it must waive the two payment checks
   * and the email check and nothing else, and it must not be combinable
   * with a live merchant.
   */
  it('lets an explicit demo run the mock provider in production', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: VALID_PRODUCTION.DATABASE_URL,
      AUTH_SECRET: VALID_PRODUCTION.AUTH_SECRET,
      APP_URL: 'https://dajda-demo.example',
      PAYMENT_PROVIDER: 'mock',
      MOCK_PAYMENT_SECRET: 'dev-mock-secret',
      DEMO_MODE: 'true',
    });
    const env = getEnv();
    expect(env.DEMO_MODE).toBe(true);
    expect(env.PAYMENT_PROVIDER).toBe('mock');
  });

  it('still demands https in a demo, because sessions are real', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: VALID_PRODUCTION.DATABASE_URL,
      AUTH_SECRET: VALID_PRODUCTION.AUTH_SECRET,
      APP_URL: 'http://dajda-demo.example',
      PAYMENT_PROVIDER: 'mock',
      DEMO_MODE: 'true',
    });
    expect(() => getEnv()).toThrow(/APP_URL/);
  });

  it('refuses a demo that is wired to a live payment merchant', () => {
    setEnv({ ...VALID_PRODUCTION, DEMO_MODE: 'true' });
    expect(() => getEnv()).toThrow(/DEMO_MODE/);
  });

  it('defaults to off, so nobody reaches demo mode by forgetting a variable', () => {
    setEnv(VALID_PRODUCTION);
    expect(getEnv().DEMO_MODE).toBe(false);
  });

  it('refuses to boot production with the shared mock secret', () => {
    setEnv({
      ...VALID_PRODUCTION,
      PAYMENT_PROVIDER: 'mock',
      MOCK_PAYMENT_SECRET: 'dev-mock-secret',
    });
    expect(() => getEnv()).toThrow(/MOCK_PAYMENT_SECRET/);
  });

  it('does not demand a mock secret when Flitt is the provider', () => {
    // The secret only signs the mock webhook, and under Flitt that route
    // answers 404. A live merchant should not have to invent one.
    setEnv({ ...VALID_PRODUCTION, MOCK_PAYMENT_SECRET: undefined });
    expect(() => getEnv()).not.toThrow();
  });

  it('refuses to boot production with APP_URL left at its default', () => {
    setEnv({ ...VALID_PRODUCTION, APP_URL: undefined });
    expect(() => getEnv()).toThrow(/APP_URL/);
  });

  it('refuses to boot production with a non-https APP_URL', () => {
    // The session cookie's Secure flag is derived from this scheme.
    setEnv({ ...VALID_PRODUCTION, APP_URL: 'http://dajda.ge' });
    expect(() => getEnv()).toThrow(/https/);
  });

  it('still requires Flitt credentials when Flitt is selected', () => {
    setEnv({ ...VALID_PRODUCTION, FLITT_SECRET_KEY: undefined });
    expect(() => getEnv()).toThrow(/FLITT_SECRET_KEY/);
  });

  it('refuses to boot production with the log email provider', () => {
    // The log provider prints mail instead of delivering it; registration
    // and password reset would silently promise emails nobody receives.
    setEnv({
      ...VALID_PRODUCTION,
      EMAIL_PROVIDER: 'log',
      EMAIL_API_KEY: undefined,
      EMAIL_FROM: undefined,
    });
    expect(() => getEnv()).toThrow(/EMAIL_PROVIDER/);
  });

  it('lets an explicit demo keep the log email provider', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: VALID_PRODUCTION.DATABASE_URL,
      AUTH_SECRET: VALID_PRODUCTION.AUTH_SECRET,
      APP_URL: 'https://dajda-demo.example',
      PAYMENT_PROVIDER: 'mock',
      MOCK_PAYMENT_SECRET: 'dev-mock-secret',
      DEMO_MODE: 'true',
    });
    expect(getEnv().EMAIL_PROVIDER).toBe('log');
  });

  it('lets `next build` compile without production secrets', () => {
    // The build machine imports this module with NODE_ENV=production while
    // collecting page data. Demanding live credentials there would stop anyone
    // compiling the app, so the guard is scoped to a running deployment.
    setEnv({ ...VALID_PRODUCTION, PAYMENT_PROVIDER: 'mock', APP_URL: undefined });
    process.env.NEXT_PHASE = 'phase-production-build';
    resetEnvCache();

    expect(() => getEnv()).not.toThrow();
  });

  it('leaves development free to use the mock provider and defaults', () => {
    setEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      AUTH_SECRET: 'x'.repeat(32),
    });

    const env = getEnv();
    expect(env.PAYMENT_PROVIDER).toBe('mock');
    expect(env.APP_URL).toBe('http://localhost:3000');
  });
});

describe('messaging configuration', () => {
  const DEV = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    AUTH_SECRET: 'x'.repeat(32),
  } as const;

  function setMessagingEnv(values: Record<string, string | undefined>) {
    for (const key of [
      'EMAIL_PROVIDER',
      'EMAIL_API_KEY',
      'EMAIL_FROM',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_USERNAME',
    ]) {
      delete process.env[key];
    }
    setEnv({ ...DEV, ...values });
  }

  it('defaults email to the provider that cannot reach anyone', () => {
    // The default has to be the safe one: a laptop with seeded demo accounts
    // must not mail addresses nobody owns the first time a button is pressed.
    setMessagingEnv({});
    expect(getEnv().EMAIL_PROVIDER).toBe('log');
  });

  it('refuses a real email provider with no key or sender', () => {
    setMessagingEnv({ EMAIL_PROVIDER: 'resend' });
    expect(() => getEnv()).toThrow(/EMAIL_API_KEY/);

    setMessagingEnv({ EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'key' });
    expect(() => getEnv()).toThrow(/EMAIL_FROM/);
  });

  it('accepts a fully configured email provider', () => {
    setMessagingEnv({
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 'key',
      EMAIL_FROM: 'DAJDA <no-reply@dajda.ge>',
    });
    expect(getEnv().EMAIL_PROVIDER).toBe('resend');
  });

  it('refuses a bot username with no token behind it', () => {
    // The deep link would open a chat that can never answer.
    setMessagingEnv({ TELEGRAM_BOT_USERNAME: 'dajda_bot' });
    expect(() => getEnv()).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('allows a token on its own: that is login-only Telegram', () => {
    setMessagingEnv({ TELEGRAM_BOT_TOKEN: '123456:secret-value' });
    expect(() => getEnv()).not.toThrow();
  });
});
