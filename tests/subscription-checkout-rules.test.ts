import { describe, expect, it } from 'vitest';
import {
  DAILY_TEST_MAX_RENEWALS,
  cancellationFields,
  cardConsentRequired,
  renewalRequest,
} from '@/lib/subscriptions/checkout-rules';

/*
 * What SUBSCRIPTION_RECURRING actually changes about a checkout.
 *
 * These are the tests for a charge the customer is not present for, so they
 * are written as much about what must NOT happen as what must: a calendar
 * opened when renewals are off would charge a card the product promised never
 * to charge again, and that is the failure worth pinning.
 */
describe('renewal request', () => {
  const JANUARY = new Date('2026-01-15T10:00:00.000Z');

  it('asks for nothing at all while renewals are off', () => {
    expect(renewalRequest(false, 'MONTHLY', JANUARY)).toBeNull();
    expect(renewalRequest(false, 'QUARTERLY', JANUARY)).toBeNull();
  });

  it('opens a monthly calendar when renewals are on', () => {
    const request = renewalRequest(true, 'MONTHLY', JANUARY);
    expect(request?.subscription.every).toBe(1);
    expect(request?.subscription.period).toBe('month');
  });

  it('counts a quarter as three months, the only unit Flitt takes', () => {
    const request = renewalRequest(true, 'QUARTERLY', JANUARY);
    expect(request?.subscription.every).toBe(3);
    expect(request?.subscription.period).toBe('month');
  });

  /*
   * The checkout takes the first payment itself. A calendar that also started
   * today would charge the same month twice, which is the one billing bug a
   * customer notices immediately.
   */
  it('starts the calendar when the paid period ends, not today', () => {
    expect(renewalRequest(true, 'MONTHLY', JANUARY)?.subscription.startDate).toBe(
      '2026-02-15',
    );
    expect(
      renewalRequest(true, 'QUARTERLY', JANUARY)?.subscription.startDate,
    ).toBe('2026-04-15');
  });

  it('opens a daily calendar for a daily test plan, starting tomorrow', () => {
    const request = renewalRequest(true, 'DAILY', JANUARY);
    expect(request?.subscription.every).toBe(1);
    expect(request?.subscription.period).toBe('day');
    expect(request?.subscription.startDate).toBe('2026-01-16');
  });

  it('bounds a daily calendar for real, not nominally', () => {
    expect(renewalRequest(true, 'DAILY', JANUARY)?.subscription.maxRenewals).toBe(
      DAILY_TEST_MAX_RENEWALS,
    );
    expect(
      renewalRequest(true, 'MONTHLY', JANUARY)?.subscription.maxRenewals,
    ).toBeUndefined();
  });

  /*
   * 20:30 UTC on the 15th is already 00:30 on the 16th in Tbilisi. Flitt's
   * page still starts that calendar on the 15th and, with seven renewals,
   * ends it on the 22nd. A first charge dated in Tbilisi time (the 17th)
   * contradicted that end date and was declined live with 2008.
   */
  it('dates the first charge in UTC, where the gateway counts from', () => {
    const afterMidnightTbilisi = new Date('2026-09-15T20:30:00.000Z');
    const schedule = renewalRequest(
      true,
      'DAILY',
      afterMidnightTbilisi,
    )?.subscription;
    expect(schedule?.startDate).toBe('2026-09-16');
  });

  it('asks for nothing for a daily plan while renewals are off', () => {
    expect(renewalRequest(false, 'DAILY', JANUARY)).toBeNull();
  });

  /*
   * Every later read - the dashboard's wording, the expiry grace, the cancel
   * path - uses the stored card token to tell a renewing subscription from a
   * one-off one. A calendar without a token would renew while the whole
   * product still described it as a single month.
   */
  it('never opens a calendar without also asking for the card token', () => {
    expect(renewalRequest(true, 'MONTHLY', JANUARY)?.requestCardToken).toBe(true);
    expect(renewalRequest(true, 'QUARTERLY', JANUARY)?.requestCardToken).toBe(
      true,
    );
  });
});

describe('consent to keeping the card', () => {
  it('is required exactly when a calendar would be opened', () => {
    expect(cardConsentRequired(true, 3000)).toBe(true);
    // A free plan reaches no card, and a one-off sale keeps none.
    expect(cardConsentRequired(true, 0)).toBe(false);
    expect(cardConsentRequired(false, 3000)).toBe(false);
  });
});

describe('canceling', () => {
  it('deletes the saved card along with the calendar', () => {
    const now = new Date('2026-09-18T09:00:00Z');
    expect(cancellationFields(now)).toEqual({
      cancelAtPeriodEnd: true,
      canceledAt: now,
      canceledBy: 'USER',
      cardToken: null,
      cardTokenLifetime: null,
    });
  });
});
