import type { BillingPeriod, PaymentStatus } from '@/generated/prisma/enums';
import type { WebhookResult } from './types';

/**
 * Provider-agnostic webhook application.
 *
 * Rules enforced here, once, for every provider:
 *   - an invalid signature is recorded and applied to nothing
 *   - a repeated (provider, eventId) is a no-op
 *   - an unrecognised status is never coerced into success
 *   - the charged amount must match the payment we created
 *   - status may only move along an explicitly allowed edge, so a late or
 *     out-of-order delivery cannot walk a payment backwards
 *   - a subscription becomes ACTIVE only on a verified transition to SUCCEEDED
 *
 * The port is injected, so all of the above is exercised in tests against
 * in-memory fakes and the same code runs in production against Prisma.
 */

export type PaymentSnapshot = {
  id: string;
  userId: string;
  planId: string | null;
  subscriptionId: string | null;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  billingPeriod: BillingPeriod | null;
};

export type RecordEventResult = { id: string; duplicate: boolean };

export interface WebhookPort {
  /**
   * Insert the delivery into the idempotency ledger. Must report `duplicate`
   * when (providerCode, eventId) already exists.
   */
  recordEvent(input: {
    providerCode: string;
    eventId: string;
    signatureValid: boolean;
    payload: Record<string, unknown>;
  }): Promise<RecordEventResult>;

  markProcessed(eventRowId: string, result: string): Promise<void>;

  findPaymentByOrderId(orderId: string): Promise<PaymentSnapshot | null>;

  /** Apply the payment status change and record the transition. */
  transitionPayment(input: {
    paymentId: string;
    from: PaymentStatus;
    to: PaymentStatus;
    webhookEventId: string;
    reason: string;
    providerPaymentId: string | null;
    maskedCard: string | null;
    cardType: string | null;
    rrn: string | null;
  }): Promise<void>;

  /** Activate the subscription this payment was for. Must be idempotent. */
  activateSubscription(input: {
    paymentId: string;
    subscriptionId: string;
    userId: string;
    currentPeriodEnd: Date;
  }): Promise<void>;

  /** A refund or chargeback ends access. */
  deactivateSubscription(input: {
    subscriptionId: string;
    reason: string;
  }): Promise<void>;
}

/** Explicit edges. Anything not listed is refused rather than guessed at. */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'],
  SUCCEEDED: ['REFUNDED', 'DISPUTED'],
  FAILED: [],
  CANCELED: [],
  EXPIRED: [],
  REFUNDED: ['DISPUTED'],
  DISPUTED: ['REFUNDED'],
};

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + (period === 'QUARTERLY' ? 3 : 1));
  return next;
}

export type ProcessAction =
  | 'REJECTED_SIGNATURE'
  | 'DUPLICATE_IGNORED'
  | 'MISSING_ORDER_ID'
  | 'UNKNOWN_STATUS'
  | 'PAYMENT_NOT_FOUND'
  | 'AMOUNT_MISMATCH'
  | 'TRANSITION_NOT_ALLOWED'
  | 'APPLIED';

export type ProcessOutcome = {
  action: ProcessAction;
  /** True only when a subscription actually moved to ACTIVE. */
  subscriptionActivated: boolean;
  from?: PaymentStatus;
  to?: PaymentStatus;
  detail?: string;
};

export async function processPaymentWebhook(
  providerCode: string,
  result: WebhookResult,
  port: WebhookPort,
  now: Date = new Date(),
): Promise<ProcessOutcome> {
  // Record every delivery, authentic or not - a burst of rejected signatures
  // is itself a signal worth having in the database.
  const event = await port.recordEvent({
    providerCode,
    eventId: result.eventId,
    signatureValid: result.signatureValid,
    payload: result.payload,
  });

  if (event.duplicate) {
    return { action: 'DUPLICATE_IGNORED', subscriptionActivated: false };
  }

  if (!result.signatureValid) {
    await port.markProcessed(
      event.id,
      `rejected: ${result.rejectionReason ?? 'INVALID_SIGNATURE'}`,
    );
    return {
      action: 'REJECTED_SIGNATURE',
      subscriptionActivated: false,
      detail: result.rejectionReason,
    };
  }

  if (!result.orderId) {
    await port.markProcessed(event.id, 'rejected: missing order id');
    return { action: 'MISSING_ORDER_ID', subscriptionActivated: false };
  }

  if (result.status === null) {
    // Unknown vocabulary: leave the payment untouched and keep the row for a
    // human to look at. Never optimistically treat it as approved.
    await port.markProcessed(
      event.id,
      `needs review: unrecognised status "${result.rawStatus ?? ''}"`,
    );
    return {
      action: 'UNKNOWN_STATUS',
      subscriptionActivated: false,
      detail: result.rawStatus ?? undefined,
    };
  }

  const payment = await port.findPaymentByOrderId(result.orderId);
  if (!payment) {
    await port.markProcessed(event.id, 'rejected: no matching payment');
    return { action: 'PAYMENT_NOT_FOUND', subscriptionActivated: false };
  }

  // Guard against a callback that claims a different price than we charged.
  if (
    result.amountMinor !== null &&
    (result.amountMinor !== payment.amountMinor ||
      (result.currency !== null && result.currency !== payment.currency))
  ) {
    await port.markProcessed(
      event.id,
      `rejected: amount mismatch (expected ${payment.amountMinor} ${payment.currency}, got ${result.amountMinor} ${result.currency ?? '?'})`,
    );
    return {
      action: 'AMOUNT_MISMATCH',
      subscriptionActivated: false,
      from: payment.status,
      to: result.status,
    };
  }

  if (!canTransition(payment.status, result.status)) {
    await port.markProcessed(
      event.id,
      `ignored: ${payment.status} -> ${result.status} is not an allowed transition`,
    );
    return {
      action: 'TRANSITION_NOT_ALLOWED',
      subscriptionActivated: false,
      from: payment.status,
      to: result.status,
    };
  }

  await port.transitionPayment({
    paymentId: payment.id,
    from: payment.status,
    to: result.status,
    webhookEventId: event.id,
    reason: `provider status "${result.rawStatus ?? ''}"`,
    providerPaymentId: result.providerPaymentId,
    maskedCard: result.maskedCard,
    cardType: result.cardType,
    rrn: result.rrn,
  });

  let subscriptionActivated = false;

  if (result.status === 'SUCCEEDED' && payment.subscriptionId) {
    await port.activateSubscription({
      paymentId: payment.id,
      subscriptionId: payment.subscriptionId,
      userId: payment.userId,
      currentPeriodEnd: addBillingPeriod(
        now,
        payment.billingPeriod ?? 'MONTHLY',
      ),
    });
    subscriptionActivated = true;
  }

  if (
    (result.status === 'REFUNDED' || result.status === 'DISPUTED') &&
    payment.subscriptionId
  ) {
    await port.deactivateSubscription({
      subscriptionId: payment.subscriptionId,
      reason: `payment ${result.status.toLowerCase()}`,
    });
  }

  await port.markProcessed(
    event.id,
    `applied: ${payment.status} -> ${result.status}`,
  );

  return {
    action: 'APPLIED',
    subscriptionActivated,
    from: payment.status,
    to: result.status,
  };
}
