import type { PaymentStatus } from '@/generated/prisma/enums';
import type { PaymentVerification, WebhookResult } from './types';

/**
 * The decisions the stale checkout sweep makes, kept apart from the
 * database and the provider so they can be tested as plain functions. The
 * sweep itself is in sweep.ts.
 */

export const STALE_CHECKOUT_MS = 24 * 60 * 60 * 1000;

/** Nothing younger than a day is touched: the buyer may still be paying. */
export function isStaleCheckout(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= STALE_CHECKOUT_MS;
}

/**
 * What a stale order becomes, given the gateway's current view of it. A
 * success is a success; a decline is recorded as one; anything still open
 * or unrecognised after a day is expired, because the buyer is not coming
 * back to that page.
 */
export function staleOrderStatus(verification: PaymentVerification): PaymentStatus {
  if (verification.status === 'SUCCEEDED') return 'SUCCEEDED';
  if (verification.status === 'FAILED') return 'FAILED';
  return 'EXPIRED';
}

/**
 * The gateway's answer as a WebhookResult, so the ordinary webhook rules
 * apply to it: amount guard, transition guard, one activation. It is marked
 * signature-valid because it came over our authenticated status call, and
 * its event id names the sweep, so a real callback for the same order
 * later is a separate event.
 */
export function sweepResult(
  orderId: string,
  verification: PaymentVerification,
  now: Date,
): WebhookResult {
  const status = staleOrderStatus(verification);
  return {
    eventId: `sweep:${orderId}:${status}`,
    signatureValid: true,
    orderId,
    providerPaymentId: verification.providerPaymentId,
    status,
    rawStatus: verification.rawStatus,
    amountMinor: verification.amountMinor,
    currency: verification.currency,
    maskedCard: null,
    cardType: null,
    rrn: null,
    cardToken: null,
    cardTokenLifetime: null,
    parentOrderId: null,
    payload: {
      source: 'sweep',
      checkedAt: now.toISOString(),
      gatewayStatus: verification.rawStatus,
    },
  };
}
