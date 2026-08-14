import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentStatus } from '@/generated/prisma/enums';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  PaymentVerification,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  WebhookResult,
} from './types';

/**
 * Development payment provider.
 *
 * It deliberately mimics the shape of a real integration rather than
 * short-circuiting it: checkout returns a URL to a local page, and confirming
 * there causes a genuine signed server-to-server POST to the same webhook
 * endpoint production uses. Nothing is activated by the browser redirect, so
 * the untrusted-redirect path is exercised in development too.
 */

export const MOCK_PROVIDER_CODE = 'mock';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';
export const MOCK_TIMESTAMP_HEADER = 'x-mock-timestamp';
export const MOCK_EVENT_ID_HEADER = 'x-mock-event-id';

/** Deliveries older than this are refused, which blunts replay attempts. */
export const MOCK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Sign `${timestamp}.${rawBody}` rather than the body alone, so a captured
 * signature cannot be reattached to a different timestamp.
 */
export function signMockWebhook(
  rawBody: string,
  timestamp: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export type MockSignatureCheck =
  | { valid: true }
  | { valid: false; reason: 'MISSING_HEADERS' | 'BAD_TIMESTAMP' | 'REPLAY_WINDOW_EXCEEDED' | 'INVALID_SIGNATURE' };

export function verifyMockSignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now?: number;
}): MockSignatureCheck {
  if (!input.signature || !input.timestamp) {
    return { valid: false, reason: 'MISSING_HEADERS' };
  }

  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: 'BAD_TIMESTAMP' };
  }

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestamp) > MOCK_REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'REPLAY_WINDOW_EXCEEDED' };
  }

  const expected = signMockWebhook(input.rawBody, timestamp, input.secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signature, 'utf8');
  if (a.length !== b.length) return { valid: false, reason: 'INVALID_SIGNATURE' };
  if (!timingSafeEqual(a, b)) return { valid: false, reason: 'INVALID_SIGNATURE' };

  return { valid: true };
}

const MOCK_STATUS_MAP: Record<string, PaymentStatus> = {
  approved: 'SUCCEEDED',
  declined: 'FAILED',
  canceled: 'CANCELED',
  reversed: 'REFUNDED',
  processing: 'PROCESSING',
  expired: 'EXPIRED',
};

export type MockWebhookPayload = {
  order_id?: string;
  payment_id?: string;
  order_status?: string;
  amount?: number;
  currency?: string;
  masked_card?: string;
  card_type?: string;
};

export type MockConfig = {
  secret: string;
  appUrl: string;
};

export class MockPaymentProvider implements PaymentProvider {
  readonly code = MOCK_PROVIDER_CODE;

  constructor(private readonly config: MockConfig) {}

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutSession> {
    const url = new URL('/dev/checkout', this.config.appUrl);
    url.searchParams.set('order', input.orderId);
    url.searchParams.set('amount', String(input.amountMinor));
    url.searchParams.set('currency', input.currency);

    return {
      checkoutUrl: url.toString(),
      providerPaymentId: null,
      orderId: input.orderId,
    };
  }

  /**
   * The mock gateway keeps no state of its own; the webhook is the only thing
   * that ever moves a payment forward, exactly as in production.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerification> {
    return {
      orderId: input.orderId,
      providerPaymentId: null,
      status: 'PROCESSING',
      rawStatus: 'processing',
      amountMinor: null,
      currency: null,
    };
  }

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const rawBody = await request.text();

    const check = verifyMockSignature({
      rawBody,
      signature: request.headers.get(MOCK_SIGNATURE_HEADER),
      timestamp: request.headers.get(MOCK_TIMESTAMP_HEADER),
      secret: this.config.secret,
    });

    let payload: MockWebhookPayload = {};
    try {
      payload = JSON.parse(rawBody) as MockWebhookPayload;
    } catch {
      payload = {};
    }

    const rawStatus = payload.order_status ?? null;
    const orderId = payload.order_id ?? null;
    const providerPaymentId = payload.payment_id ?? null;

    return {
      eventId:
        request.headers.get(MOCK_EVENT_ID_HEADER) ??
        `${providerPaymentId ?? orderId ?? 'unknown'}:${rawStatus ?? 'unknown'}`,
      signatureValid: check.valid,
      orderId,
      providerPaymentId,
      status: rawStatus
        ? (MOCK_STATUS_MAP[rawStatus.toLowerCase()] ?? null)
        : null,
      rawStatus,
      amountMinor: payload.amount ?? null,
      currency: payload.currency ?? null,
      maskedCard: payload.masked_card ?? null,
      cardType: payload.card_type ?? null,
      rrn: null,
      payload: payload as Record<string, unknown>,
      ...(check.valid ? {} : { rejectionReason: check.reason }),
    };
  }

  async refundPayment(input: RefundInput): Promise<RefundResult> {
    return {
      orderId: input.orderId,
      refundId: `mock-refund-${input.orderId}`,
      status: 'ACCEPTED',
      rawStatus: 'reversed',
    };
  }
}
