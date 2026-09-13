import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/*
 * The probe has to name the right subsystem.
 *
 * A deployment that set DEMO_MODE alongside a live payment merchant answered
 * "database: down" while the database was up, and the search went to the
 * database for an afternoon. The configuration and the database are separate
 * failures and the probe now says which one it hit - the category only, never
 * the variable or its value, which stay in the server log.
 */

const KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'APP_URL',
  'DEMO_MODE',
  'PAYMENT_PROVIDER',
  'FLITT_MERCHANT_ID',
  'FLITT_SECRET_KEY',
  'EMAIL_PROVIDER',
  'EMAIL_API_KEY',
  'EMAIL_FROM',
] as const;

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
});

afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('health probe', () => {
  it('blames the configuration when the environment is contradictory', async () => {
    const env = process.env as Record<string, string | undefined>;
    for (const key of KEYS) delete env[key];

    // The exact production state that took the site down: an openly-labelled
    // demo pointed at a live merchant, which the schema refuses.
    env.DATABASE_URL = 'postgresql://user:pass@db.internal:5432/dajda';
    env.AUTH_SECRET = 'x'.repeat(32);
    env.APP_URL = 'https://dajda.ge';
    env.NODE_ENV = 'production';
    env.DEMO_MODE = 'true';
    env.PAYMENT_PROVIDER = 'flitt';
    env.FLITT_MERCHANT_ID = '1000';
    env.FLITT_SECRET_KEY = 'flitt-secret';
    env.EMAIL_PROVIDER = 'resend';
    env.EMAIL_API_KEY = 'key';
    env.EMAIL_FROM = 'DAJDA <no-reply@dajda.ge>';
    resetEnvCache();

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(503);
    expect(body.reason).toBe('configuration');
    expect(body.database).not.toBe('down');
  });

  it('names nothing about the variable that is wrong', async () => {
    const env = process.env as Record<string, string | undefined>;
    for (const key of KEYS) delete env[key];
    env.NODE_ENV = 'production';
    resetEnvCache();

    const { GET } = await import('@/app/api/health/route');
    const serialized = JSON.stringify(await (await GET()).json());

    // The response is a category. Anything more is a configuration disclosure
    // to whoever is reading a public endpoint.
    for (const key of KEYS) expect(serialized).not.toContain(key);
  });
});
