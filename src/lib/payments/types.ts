import type { PaymentStatus } from '@/generated/prisma/enums';

/**
 * Payment provider abstraction.
 *
 * DAJDA charges a subscription fee for access to written analysis. A provider
 * implementation takes the charge for a plan (one-off or on a gateway-managed
 * schedule), reverses one, charges a stored card token, and can credit funds
 * back out to a card (payout). There is still no wallet and no balance.
 */

/**
 * Gateway-managed renewal schedule. When present on a checkout, the gateway
 * charges the card again `every` x `period` without the customer returning.
 */
export type SubscriptionSchedule = {
  every: number;
  period: 'day' | 'week' | 'month' | 'year';
  /**
   * Date (YYYY-MM-DD) of the first *scheduled* charge. The checkout itself
   * takes the first payment; this is when the calendar starts.
   */
  startDate?: string;
};

export type CreateCheckoutInput = {
  /** Our order identifier; becomes the provider's order_id. */
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  /** Where the browser lands afterwards. Never used to confirm payment. */
  returnUrl: string;
  /** Server-to-server notification endpoint. This is the source of truth. */
  callbackUrl: string;
  customerEmail?: string;
  /** Ask the gateway to schedule automatic renewals for this order. */
  subscription?: SubscriptionSchedule;
  /**
   * Ask the gateway to issue a reusable card token in the callback, enabling
   * merchant-initiated recurring charges without the customer present.
   */
  requestCardToken?: boolean;
};

export type CheckoutSession = {
  /** URL to send the customer to. */
  checkoutUrl: string;
  /** The provider's own identifier for the attempt, when known this early. */
  providerPaymentId: string | null;
  orderId: string;
};

export type VerifyPaymentInput = {
  orderId: string;
};

export type PaymentVerification = {
  orderId: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  rawStatus: string;
  amountMinor: number | null;
  currency: string | null;
};

/**
 * A parsed, signature-checked webhook.
 *
 * The adapter's job ends here: it verifies authenticity and normalises the
 * vocabulary. Deciding what the event *means* for a subscription is the
 * processor's job (see `processPaymentWebhook`), which keeps that logic
 * identical across providers.
 */
export type WebhookResult = {
  /** Stable per-event id, used for idempotency. */
  eventId: string;
  signatureValid: boolean;
  orderId: string | null;
  providerPaymentId: string | null;
  /** Null when the provider sent a status we do not recognise. */
  status: PaymentStatus | null;
  rawStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
  maskedCard: string | null;
  cardType: string | null;
  rrn: string | null;
  /** Reusable card token, when one was requested at checkout. Never a PAN. */
  cardToken: string | null;
  /** Token validity as reported by the gateway, verbatim. */
  cardTokenLifetime: string | null;
  /**
   * For a gateway-scheduled renewal charge: the order_id of the original
   * checkout that created the schedule. Null on first payments.
   */
  parentOrderId: string | null;
  /** Stored verbatim for audit. */
  payload: Record<string, unknown>;
  /** Populated when the request could not be trusted. */
  rejectionReason?: string;
};

export type RefundInput = {
  orderId: string;
  amountMinor: number;
  currency: string;
  reason?: string;
};

export type RefundResult = {
  orderId: string;
  refundId: string | null;
  status: 'ACCEPTED' | 'REJECTED';
  rawStatus: string;
  message?: string;
};

/**
 * Merchant-initiated charge against a card token obtained via
 * `requestCardToken`. The customer is not present; there is no redirect.
 */
export type RecurringChargeInput = {
  /** A fresh order identifier for this charge, never a reused one. */
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  cardToken: string;
  /** Server-to-server notification endpoint for the charge's final status. */
  callbackUrl?: string;
};

export type SubscriptionActionInput = {
  /** The order_id of the checkout that created the gateway-side schedule. */
  orderId: string;
  action: 'start' | 'stop';
};

export type SubscriptionActionResult = {
  orderId: string;
  action: 'start' | 'stop';
  status: 'ACCEPTED' | 'REJECTED';
  rawStatus: string;
  message?: string;
};

/**
 * Credit funds to a card (e.g. paying an analyst out). Exactly one of
 * `receiverCardToken` / `receiverCardNumber` must be set; prefer the token so
 * the PAN never crosses this server.
 */
export type PayoutInput = {
  /** Our identifier for the payout; becomes the provider's order_id. */
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  receiverCardToken?: string;
  receiverCardNumber?: string;
};

export type PayoutResult = {
  orderId: string;
  providerPaymentId: string | null;
  status: 'SUCCEEDED' | 'PROCESSING' | 'FAILED';
  rawStatus: string;
  message?: string;
};

export interface PaymentProvider {
  readonly code: string;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerification>;
  handleWebhook(request: Request): Promise<WebhookResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
  /** Charge a stored card token without the customer present. */
  chargeRecurring(input: RecurringChargeInput): Promise<PaymentVerification>;
  /** Pause or resume a gateway-managed renewal schedule. */
  setSubscriptionState(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResult>;
  /** Credit funds out to a card. */
  createPayout(input: PayoutInput): Promise<PayoutResult>;
}
