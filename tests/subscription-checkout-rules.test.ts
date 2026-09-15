import { describe, expect, it } from 'vitest';
import {
  DAILY_TEST_MAX_RENEWALS,
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
   * 22:30 UTC on the 15th is already 02:30 on the 16th in Tbilisi, where the
   * gateway keeps its calendar. Read in UTC, the first daily charge would land
   * on the 16th: the day that was just paid for, charged twice.
   */
  it('dates the first charge in Tbilisi time, not UTC', () => {
    const lateNightTbilisi = new Date('2026-01-15T22:30:00.000Z');
    expect(
      renewalRequest(true, 'DAILY', lateNightTbilisi)?.subscription.startDate,
    ).toBe('2026-01-17');
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
