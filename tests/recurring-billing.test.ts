import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Whether subscriptions actually renew.
 *
 * Two inputs: SUBSCRIPTION_RECURRING, what the operator asked for, and the
 * billing-mode marker compiled from docs/legal/terms.md, what the published
 * terms promise a card will do. The terms win, because a charge the customer
 * did not initiate is only defensible if the document they agreed to
 * describes it.
 *
 * The contradiction case is the one worth pinning hardest. It took the live
 * site down once: the check was an environment guard that refused to parse,
 * and because the site header reads env, every page answered 500 while the
 * deployment reported success. It must now degrade - site up, renewals off -
 * and never throw.
 */

const VALID: Record<string, string> = {
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
  vi.resetModules();
  vi.restoreAllMocks();
  const { resetEnvCache } = await import('@/lib/env');
  resetEnvCache();
});

/**
 * Loads the module fresh with the terms marker mocked, so the committed
 * document keeps saying "oneoff" until a lawyer has read the new clauses.
 */
async function load(termsMode: 'oneoff' | 'recurring', declared: string) {
  vi.resetModules();
  vi.doMock('@/lib/legal/billing-mode.generated', () => ({
    TERMS_BILLING_MODE: termsMode,
  }));
  for (const key of Object.keys(VALID)) delete process.env[key];
  delete process.env.SUBSCRIPTION_RECURRING;
  for (const [key, value] of Object.entries(VALID)) process.env[key] = value;
  if (declared) process.env.SUBSCRIPTION_RECURRING = declared;

  const { resetEnvCache } = await import('@/lib/env');
  resetEnvCache();
  const mod = await import('@/lib/subscriptions/recurring');
  mod.resetRecurringWarning();
  return mod;
}

describe('recurring billing decision', () => {
  it('renews when the operator asked and the terms describe it', async () => {
    const { recurringBillingEnabled, recurringBillingContradicted } =
      await load('recurring', 'true');
    expect(recurringBillingEnabled()).toBe(true);
    expect(recurringBillingContradicted()).toBe(false);
  });

  it('does not renew when nobody asked, whatever the terms say', async () => {
    const off = await load('recurring', 'false');
    expect(off.recurringBillingEnabled()).toBe(false);
    expect(off.recurringBillingContradicted()).toBe(false);

    const absent = await load('recurring', '');
    expect(absent.recurringBillingEnabled()).toBe(false);
  });

  it('does not renew against terms that promise it never happens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recurringBillingEnabled } = await load('oneoff', 'true');
    expect(recurringBillingEnabled()).toBe(false);
  });

  /*
   * The failure that mattered: this must degrade, not throw. A contradiction
   * is a deployment mistake about one feature and must never be an outage.
   */
  it('stays up rather than throwing on a contradiction', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recurringBillingEnabled, recurringBillingContradicted } =
      await load('oneoff', 'true');
    expect(() => recurringBillingEnabled()).not.toThrow();
    expect(recurringBillingContradicted()).toBe(true);
  });

  it('says so in the log, once, not on every render', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recurringBillingEnabled } = await load('oneoff', 'true');
    recurringBillingEnabled();
    recurringBillingEnabled();
    recurringBillingEnabled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/SUBSCRIPTION_RECURRING/);
  });

  it('keeps quiet when there is nothing wrong', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { recurringBillingEnabled } = await load('recurring', 'true');
    recurringBillingEnabled();
    expect(error).not.toHaveBeenCalled();
  });
});
