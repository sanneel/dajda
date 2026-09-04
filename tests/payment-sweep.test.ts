import { describe, expect, it } from 'vitest';
import {
  STALE_CHECKOUT_MS,
  isStaleCheckout,
  staleOrderStatus,
  sweepResult,
} from '@/lib/payments/sweep-rules';
import type { PaymentVerification } from '@/lib/payments/types';

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
