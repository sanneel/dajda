import { describe, expect, it } from 'vitest';
import {
  STALE_CHECKOUT_MS,
  isStaleCheckout,
  staleOrderStatus,
  sweepResult,
} from '@/lib/payments/sweep-rules';
import type { PaymentVerification } from '@/lib/payments/types';
import {
  RENEWAL_GRACE_MS,
  subscriptionHasLapsed,
} from '@/lib/subscriptions/expiry-rules';

function verification(overrides: Partial<PaymentVerification> = {}): PaymentVerification {
  return {
    orderId: 'dajda-order-9',
    providerPaymentId: 'pay-9',
    status: 'PROCESSING',
    rawStatus: 'created',
    amountMinor: 3000,
    currency: 'GEL',
    ...overrides,
  };
}

describe('stale checkout sweep', () => {
  const now = new Date('2026-09-05T10:00:00Z');

  it('leaves orders younger than a day alone', () => {
    expect(isStaleCheckout(new Date(now.getTime() - STALE_CHECKOUT_MS + 1), now)).toBe(false);
    expect(isStaleCheckout(new Date(now.getTime() - STALE_CHECKOUT_MS), now)).toBe(true);
  });

  it('keeps a late approval as a success and a decline as a failure', () => {
    expect(staleOrderStatus(verification({ status: 'SUCCEEDED', rawStatus: 'approved' }))).toBe('SUCCEEDED');
    expect(staleOrderStatus(verification({ status: 'FAILED', rawStatus: 'declined' }))).toBe('FAILED');
  });

  it('expires anything still open after a day', () => {
    expect(staleOrderStatus(verification({ status: 'PROCESSING', rawStatus: 'created' }))).toBe('EXPIRED');
    expect(staleOrderStatus(verification({ status: 'PROCESSING', rawStatus: '' }))).toBe('EXPIRED');
  });

  it('builds a webhook result the ordinary rules can apply', () => {
    const result = sweepResult('dajda-order-9', verification({ status: 'SUCCEEDED', rawStatus: 'approved' }), now);
    expect(result.signatureValid).toBe(true);
    expect(result.eventId).toBe('sweep:dajda-order-9:SUCCEEDED');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.amountMinor).toBe(3000);
    expect(result.cardToken).toBeNull();
    expect(result.payload).toMatchObject({ source: 'sweep', gatewayStatus: 'approved' });
  });
});

describe('subscription expiry', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const hour = 60 * 60 * 1000;

  it('closes a month that ended, and not one still running', () => {
    expect(
      subscriptionHasLapsed(
        { currentPeriodEnd: new Date(now.getTime() - hour), hasRenewalCalendar: false },
        now,
      ),
    ).toBe(true);
    expect(
      subscriptionHasLapsed(
        { currentPeriodEnd: new Date(now.getTime() + hour), hasRenewalCalendar: false },
        now,
      ),
    ).toBe(false);
  });

  it('ends exactly at the period end', () => {
    expect(
      subscriptionHasLapsed({ currentPeriodEnd: now, hasRenewalCalendar: false }, now),
    ).toBe(true);
  });

  it('never closes an open-ended grant', () => {
    expect(
      subscriptionHasLapsed({ currentPeriodEnd: null, hasRenewalCalendar: false }, now),
    ).toBe(false);
  });

  /*
   * A subscription bought while checkouts still opened a gateway calendar may
   * be renewed by the gateway on the day it ends. Closing it at that moment
   * would leave the renewal charging a card for a row that no longer opens.
   */
  it('gives an old renewing subscription its grace before closing it', () => {
    const ended = new Date(now.getTime() - hour);
    expect(
      subscriptionHasLapsed({ currentPeriodEnd: ended, hasRenewalCalendar: true }, now),
    ).toBe(false);
    expect(
      subscriptionHasLapsed(
        {
          currentPeriodEnd: new Date(now.getTime() - RENEWAL_GRACE_MS),
          hasRenewalCalendar: true,
        },
        now,
      ),
    ).toBe(true);
  });
});
