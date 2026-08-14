import type { PaymentStatus } from '@/generated/prisma/enums';

/**
 * Payment provider abstraction.
 *
 * DAJDA charges a subscription fee for access to written analysis. There is no
 * wallet, no balance and no payout path - a provider implementation only ever
 * takes a one-off charge for a plan, or reverses one.
 */

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

export interface PaymentProvider {
  readonly code: string;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerification>;
  handleWebhook(request: Request): Promise<WebhookResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
}
