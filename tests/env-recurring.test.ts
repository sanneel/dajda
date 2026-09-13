import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The other half of the recurring guard.
 *
 * env.test.ts proves the guard REFUSES a deploy whose terms still promise a
 * card is never charged again. That alone would also pass if the guard
 * refused everything, leaving a flag that can never be turned on - so this
 * file pins the permitting case, with the terms marked as describing
 * automatic renewal.
 *
 * The marker is generated from docs/legal/terms.md by `npm run legal:sync`,
 * so it is mocked here rather than edited: the committed document says
 * "oneoff" and should keep saying so until a lawyer has read the clauses in
 * docs/legal/recurring-billing-clauses.md.
 */
vi.mock('@/lib/legal/billing-mode.generated', () => ({
  TERMS_BILLING_MODE: 'recurring',
}));

const VALID_PRODUCTION: Record<string, string> = {
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
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
});

afterEach(async () => {
  process.env = saved;
  const { resetEnvCache } = await import('@/lib/env');
  resetEnvCache();
});

async function envWith(values: Record<string, string>) {
  const { getEnv, resetEnvCache } = await import('@/lib/env');
  for (const key of Object.keys(VALID_PRODUCTION)) delete process.env[key];
  delete process.env.DEMO_MODE;
  delete process.env.SUBSCRIPTION_RECURRING;
  delete process.env.NEXT_PHASE;
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  resetEnvCache();
  return getEnv();
}

describe('recurring billing with terms that describe it', () => {
  it('boots with renewals on', async () => {
    const env = await envWith({
      ...VALID_PRODUCTION,
      SUBSCRIPTION_RECURRING: 'true',
    });
    expect(env.SUBSCRIPTION_RECURRING).toBe(true);
  });

  /*
   * Terms describing automatic renewal do not themselves turn it on: a
   * deployment that has updated its documents but not yet had the gateway
   * confirm the annex still sells one month at a time.
   */
  it('still defaults to off', async () => {
    const env = await envWith(VALID_PRODUCTION);
    expect(env.SUBSCRIPTION_RECURRING).toBe(false);
  });
});
