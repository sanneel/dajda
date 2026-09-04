import type {
  BillingPeriod,
  PaymentPurpose,
  PaymentStatus,
} from '@/generated/prisma/enums';
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
 *   - a gateway-scheduled renewal (a new order naming its parent_order_id)
 *     is recorded as a payment of its own and extends the paid period, with
 *     the same amount guard applied against the original payment
 *   - a BALANCE_TOPUP payment credits the balance exactly once on SUCCEEDED
 *     and takes the credit back exactly once on REFUNDED/DISPUTED
 *   - a SUBSCRIPTION payment credits the analyst's share of it exactly once,
 *     and takes it back if the subscriber's payment is later reversed
 *
 * The port is injected, so all of the above is exercised in tests against
 * in-memory fakes and the same code runs in production against Prisma.
 */

export type PaymentSnapshot = {
  id: string;
  userId: string;
  planId: string | null;
  subscriptionId: string | null;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  billingPeriod: BillingPeriod | null;
  /** Set on a TICKET payment: the single paid prediction being bought. */
  predictionId: string | null;
  /** The analyst whose plan (or ticket) this paid for, when there is one. */
  analystProfileId: string | null;
  /** That analyst's user account, which is where their share is credited. */
  analystUserId: string | null;
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

  /**
   * The payment for a subscription that was never active failed, was
   * cancelled or expired: close the PENDING row so it stops reading as
   * "awaiting confirmation". Marked as closed by the payment, so a later
   * approval of the same order (a retry on the gateway's page) can reopen
   * exactly this row and nothing a person cancelled. Idempotent.
   */
  closePendingSubscription(input: {
    subscriptionId: string;
    reason: string;
  }): Promise<void>;

  /**
   * Persist a gateway-issued card token on the subscription, enabling
   * merchant-initiated recurring charges. Overwrites any previous token -
   * the gateway may rotate them. The token is opaque; never a PAN.
   */
  saveCardToken(input: {
    subscriptionId: string;
    userId: string;
    cardToken: string;
    cardTokenLifetime: string | null;
  }): Promise<void>;

  /**
   * Record a verified gateway-initiated renewal charge as a SUCCEEDED
   * payment of its own. Must be idempotent on orderId.
   */
  recordRenewalPayment(input: {
    orderId: string;
    parentPaymentId: string;
    subscriptionId: string;
    userId: string;
    planId: string | null;
    providerCode: string;
    providerPaymentId: string | null;
    amountMinor: number;
    currency: string;
    webhookEventId: string;
    maskedCard: string | null;
    cardType: string | null;
    rrn: string | null;
    /** Null when this renewal order was already recorded. */
  }): Promise<{ paymentId: string | null }>;

  /** Extend the paid period after a verified renewal charge. Idempotent. */
  renewSubscription(input: {
    subscriptionId: string;
    userId: string;
    currentPeriodEnd: Date;
  }): Promise<void>;

  /** Grant one-off access to the ticket a TICKET payment bought. Idempotent. */
  grantTicketPurchase(input: {
    paymentId: string;
    userId: string;
    predictionId: string;
    amountMinor: number;
    currency: string;
  }): Promise<void>;

  /** A refund or chargeback on a TICKET payment ends that access. Idempotent. */
  revokeTicketPurchase(input: {
    userId: string;
    predictionId: string;
    reason: string;
  }): Promise<void>;

  /**
   * Credit the analyst their share of a subscriber's verified payment.
   *
   * Takes the GROSS amount the subscriber paid; splitting it is the port's
   * job, because the split rate is configuration rather than a fact about
   * this delivery. Must be idempotent per payment.
   */
  creditAnalystEarning(input: {
    paymentId: string;
    analystUserId: string;
    analystProfileId: string;
    grossAmountMinor: number;
    currency: string;
  }): Promise<void>;

  /**
   * Take that share back after the subscriber's payment was reversed. Also
   * idempotent per payment. The analyst's earnings may go negative: money
   * already withdrawn and then charged back is a debt, not a gift.
   */
  reverseAnalystEarning(input: {
    paymentId: string;
    analystUserId: string;
    grossAmountMinor: number;
    currency: string;
    reason: string;
  }): Promise<void>;

  /**
   * Credit a verified top-up onto the user's balance. Must be idempotent
   * per payment - a redelivery under a fresh event id credits nothing.
   */
  creditBalanceTopUp(input: {
    paymentId: string;
    userId: string;
    amountMinor: number;
    currency: string;
  }): Promise<void>;

  /**
   * Take a refunded or disputed top-up's credit back. Also idempotent per
   * payment. The balance may go negative: money that was spent and then
   * pulled back by the bank is a debt, and the ledger says so.
   */
  reverseBalanceTopUp(input: {
    paymentId: string;
    userId: string;
    amountMinor: number;
    currency: string;
    reason: string;
  }): Promise<void>;
}

/** Explicit edges. Anything not listed is refused rather than guessed at. */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'],
  SUCCEEDED: ['REFUNDED', 'DISPUTED'],
  // A decline is not the end of the order: the gateway's page lets the
  // customer try another card under the same order id, and the approval
  // that follows names it. Refusing that edge would take the money and
  // grant nothing. An expired order cannot be paid again, so it stays shut.
  FAILED: ['SUCCEEDED'],
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
  | 'APPLIED'
  | 'RENEWAL_APPLIED'
  | 'RENEWAL_IGNORED';

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
    // Not one of our orders - unless the gateway created it itself from a
    // subscription calendar, in which case it names the original checkout.
    if (result.parentOrderId) {
      return processRenewal(providerCode, result, port, event.id, now);
    }
    await port.markProcessed(event.id, 'rejected: no matching payment');
    return { action: 'PAYMENT_NOT_FOUND', subscriptionActivated: false };
  }

  // Guard against a callback that claims a different price than we charged.
  // A success that names no amount at all is not one we can check, and is
  // refused the same way rather than trusted.
  const amountMissing = result.amountMinor === null;
  const amountWrong =
    !amountMissing &&
    (result.amountMinor !== payment.amountMinor ||
      (result.currency !== null && result.currency !== payment.currency));
  if (amountWrong || (amountMissing && result.status === 'SUCCEEDED')) {
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

  // A token issued for this payment outlives it: it is what future
  // merchant-initiated charges will use. Stored only off a verified success.
  if (result.status === 'SUCCEEDED' && payment.subscriptionId && result.cardToken) {
    await port.saveCardToken({
      subscriptionId: payment.subscriptionId,
      userId: payment.userId,
      cardToken: result.cardToken,
      cardTokenLifetime: result.cardTokenLifetime,
    });
  }

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

  // The first payment did not go through: the subscription it was to open
  // must not sit as "awaiting confirmation". Closed by the payment, so an
  // approval that follows a decline on the same order reopens it.
  if (
    (result.status === 'FAILED' ||
      result.status === 'CANCELED' ||
      result.status === 'EXPIRED') &&
    payment.subscriptionId
  ) {
    await port.closePendingSubscription({
      subscriptionId: payment.subscriptionId,
      reason: `payment ${result.status.toLowerCase()}`,
    });
  }

  // A TICKET payment buys one paid prediction outright. Both directions are
  // idempotent inside the port, so a redelivery cannot double-grant.
  if (payment.purpose === 'TICKET' && payment.predictionId) {
    if (result.status === 'SUCCEEDED') {
      await port.grantTicketPurchase({
        paymentId: payment.id,
        userId: payment.userId,
        predictionId: payment.predictionId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
    }
    if (result.status === 'REFUNDED' || result.status === 'DISPUTED') {
      await port.revokeTicketPurchase({
        userId: payment.userId,
        predictionId: payment.predictionId,
        reason: `payment ${result.status.toLowerCase()}`,
      });
    }
  }

  // The analyst earns from a subscriber's or a ticket buyer's payment, not
  // from a top-up. Both directions are idempotent per payment inside the port.
  if (
    (payment.purpose === 'SUBSCRIPTION' || payment.purpose === 'TICKET') &&
    payment.analystUserId
  ) {
    if (result.status === 'SUCCEEDED') {
      await port.creditAnalystEarning({
        paymentId: payment.id,
        analystUserId: payment.analystUserId,
        analystProfileId: payment.analystProfileId as string,
        grossAmountMinor: payment.amountMinor,
        currency: payment.currency,
      });
    }
    if (result.status === 'REFUNDED' || result.status === 'DISPUTED') {
      await port.reverseAnalystEarning({
        paymentId: payment.id,
        analystUserId: payment.analystUserId,
        grossAmountMinor: payment.amountMinor,
        currency: payment.currency,
        reason: `subscriber payment ${result.status.toLowerCase()}`,
      });
    }
  }

  // A top-up moves the balance instead of a subscription. Both directions
  // are idempotent per payment inside the port, so a redelivery under a
  // fresh event id cannot double-credit or double-reverse.
  if (payment.purpose === 'BALANCE_TOPUP') {
    if (result.status === 'SUCCEEDED') {
      await port.creditBalanceTopUp({
        paymentId: payment.id,
        userId: payment.userId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
    }
    if (result.status === 'REFUNDED' || result.status === 'DISPUTED') {
      await port.reverseBalanceTopUp({
        paymentId: payment.id,
        userId: payment.userId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reason: `payment ${result.status.toLowerCase()}`,
      });
    }
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

/**
 * A charge the gateway initiated on its own from a subscription calendar.
 *
 * The order id is new to us, so it resolves through the parent order instead.
 * Only a SUCCEEDED renewal changes anything: it is recorded as a payment in
 * its own right and pushes the paid period forward. A declined renewal is
 * kept for audit and touches nothing - access simply lapses at the period
 * end the customer already paid for.
 */
async function processRenewal(
  providerCode: string,
  result: WebhookResult,
  port: WebhookPort,
  eventRowId: string,
  now: Date,
): Promise<ProcessOutcome> {
  const parent = await port.findPaymentByOrderId(result.parentOrderId as string);

  if (!parent || !parent.subscriptionId) {
    await port.markProcessed(
      eventRowId,
      'rejected: renewal names an unknown parent order',
    );
    return { action: 'PAYMENT_NOT_FOUND', subscriptionActivated: false };
  }

  if (result.status !== 'SUCCEEDED') {
    await port.markProcessed(
      eventRowId,
      `renewal ignored: status "${result.rawStatus ?? ''}"`,
    );
    return {
      action: 'RENEWAL_IGNORED',
      subscriptionActivated: false,
      detail: result.rawStatus ?? undefined,
    };
  }

  // The calendar was created with the plan's price; a renewal claiming a
  // different one is refused just like a first payment would be.
  // A renewal is always a success by the time it gets here, so an absent
  // amount is refused like a wrong one: it cannot be checked.
  if (
    result.amountMinor === null ||
    result.amountMinor !== parent.amountMinor ||
    (result.currency !== null && result.currency !== parent.currency)
  ) {
    await port.markProcessed(
      eventRowId,
      `rejected: renewal amount mismatch (expected ${parent.amountMinor} ${parent.currency}, got ${result.amountMinor} ${result.currency ?? '?'})`,
    );
    return { action: 'AMOUNT_MISMATCH', subscriptionActivated: false };
  }

  const renewal = await port.recordRenewalPayment({
    orderId: result.orderId as string,
    parentPaymentId: parent.id,
    subscriptionId: parent.subscriptionId,
    userId: parent.userId,
    planId: parent.planId,
    providerCode,
    providerPaymentId: result.providerPaymentId,
    amountMinor: parent.amountMinor,
    currency: parent.currency,
    webhookEventId: eventRowId,
    maskedCard: result.maskedCard,
    cardType: result.cardType,
    rrn: result.rrn,
  });

  // Every renewal earns the analyst their share, exactly as the first charge
  // did. Keyed on the renewal's own payment row, so a redelivery credits
  // nothing twice.
  if (renewal.paymentId && parent.analystUserId) {
    await port.creditAnalystEarning({
      paymentId: renewal.paymentId,
      analystUserId: parent.analystUserId,
      analystProfileId: parent.analystProfileId as string,
      grossAmountMinor: parent.amountMinor,
      currency: parent.currency,
    });
  }

  if (result.cardToken) {
    await port.saveCardToken({
      subscriptionId: parent.subscriptionId,
      userId: parent.userId,
      cardToken: result.cardToken,
      cardTokenLifetime: result.cardTokenLifetime,
    });
  }

  await port.renewSubscription({
    subscriptionId: parent.subscriptionId,
    userId: parent.userId,
    currentPeriodEnd: addBillingPeriod(now, parent.billingPeriod ?? 'MONTHLY'),
  });

  await port.markProcessed(
    eventRowId,
    `renewal applied for parent ${result.parentOrderId}`,
  );

  return {
    action: 'RENEWAL_APPLIED',
    subscriptionActivated: true,
    to: 'SUCCEEDED',
  };
}
