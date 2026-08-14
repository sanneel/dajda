import { createHash, timingSafeEqual } from 'node:crypto';
import type { PaymentStatus } from '@/generated/prisma/enums';
import { AppError, ERROR_CODES } from '@/lib/errors';
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
 * Flitt adapter - implemented against the published API reference
 * (https://docs.flitt.com).
 *
 * Signature algorithm, per docs.flitt.com/api/building-signature:
 *   1. take every parameter except `signature` and `response_signature_string`
 *   2. drop parameters that are absent or empty (a literal 0 is NOT empty)
 *   3. sort the remaining parameters by key, alphabetically
 *   4. join their values with "|", with the merchant payment key prepended
 *   5. SHA-1 the result, lowercase hex
 *
 * STATUS: written to the documented specification but never exercised against
 * a live merchant account, because no credentials exist in this environment.
 * The pure functions below are unit tested against the worked example in the
 * documentation; the HTTP calls are the part still awaiting a real sandbox.
 */

export const FLITT_PROVIDER_CODE = 'flitt';

/** Parameters the gateway adds to a response but excludes from the digest. */
const SIGNATURE_EXCLUDED = new Set(['signature', 'response_signature_string']);

export type FlittParams = Record<string, string | number | null | undefined>;

/**
 * Build the exact string that gets hashed. Exported so tests can assert it
 * against the worked example in the documentation.
 */
export function buildSignatureBase(
  params: FlittParams,
  secretKey: string,
): string {
  const values = Object.keys(params)
    .filter((key) => !SIGNATURE_EXCLUDED.has(key))
    .sort()
    .map((key) => params[key])
    // Absent and empty are skipped; 0 and "0" are kept.
    .filter(
      (value) => value !== null && value !== undefined && value !== '',
    )
    .map((value) => String(value));

  return [secretKey, ...values].join('|');
}

export function flittSignature(params: FlittParams, secretKey: string): string {
  return createHash('sha1')
    .update(buildSignatureBase(params, secretKey), 'utf8')
    .digest('hex')
    .toLowerCase();
}

/** Constant-time comparison of two hex digests. */
export function verifyFlittSignature(
  params: FlittParams,
  secretKey: string,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false;
  const expected = flittSignature(params, secretKey);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Documented `order_status` vocabulary. Anything outside this map is treated
 * as unknown and deliberately NOT coerced into a success - an unrecognised
 * status leaves the payment where it is and raises a review flag instead.
 */
const ORDER_STATUS_MAP: Record<string, PaymentStatus> = {
  created: 'CREATED',
  processing: 'PROCESSING',
  approved: 'SUCCEEDED',
  declined: 'FAILED',
  expired: 'EXPIRED',
  reversed: 'REFUNDED',
};

export function mapFlittStatus(rawStatus: string | null): PaymentStatus | null {
  if (!rawStatus) return null;
  return ORDER_STATUS_MAP[rawStatus.trim().toLowerCase()] ?? null;
}

export type FlittConfig = {
  merchantId: string;
  secretKey: string;
  /** Callback-verification key. Flitt uses the payment key unless a separate
   *  one is configured for the merchant. */
  webhookSecret: string;
  apiUrl: string;
};

type FlittEnvelope<T> = { response: T };

export class FlittPaymentProvider implements PaymentProvider {
  readonly code = FLITT_PROVIDER_CODE;

  constructor(private readonly config: FlittConfig) {}

  private async post<T>(path: string, request: FlittParams): Promise<T> {
    const signed = {
      ...request,
      signature: flittSignature(request, this.config.secretKey),
    };

    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: signed }),
    });

    if (!response.ok) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `Flitt ${path} returned HTTP ${response.status}`,
      });
    }

    const body = (await response.json()) as FlittEnvelope<T>;
    if (!body || typeof body !== 'object' || !('response' in body)) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `Flitt ${path} returned an unexpected envelope`,
      });
    }
    return body.response;
  }

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutSession> {
    const response = await this.post<{
      response_status?: string;
      checkout_url?: string;
      payment_id?: number | string;
      error_message?: string;
      error_code?: number;
    }>('/api/checkout/url', {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      // Flitt expects the amount in minor units, which is how we store it.
      amount: input.amountMinor,
      currency: input.currency,
      order_desc: input.description,
      server_callback_url: input.callbackUrl,
      response_url: input.returnUrl,
      sender_email: input.customerEmail,
    });

    if (response.response_status !== 'success' || !response.checkout_url) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `Flitt checkout failed: ${response.error_code ?? '?'} ${
          response.error_message ?? 'unknown'
        }`,
      });
    }

    return {
      checkoutUrl: response.checkout_url,
      providerPaymentId:
        response.payment_id === undefined ? null : String(response.payment_id),
      orderId: input.orderId,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerification> {
    const response = await this.post<Record<string, string | number>>(
      '/api/status/order_id',
      {
        merchant_id: this.config.merchantId,
        order_id: input.orderId,
      },
    );

    const rawStatus = String(response.order_status ?? '');

    return {
      orderId: input.orderId,
      providerPaymentId:
        response.payment_id === undefined ? null : String(response.payment_id),
      status: mapFlittStatus(rawStatus) ?? 'PROCESSING',
      rawStatus,
      amountMinor:
        response.amount === undefined ? null : Number(response.amount),
      currency:
        response.currency === undefined ? null : String(response.currency),
    };
  }

  /**
   * Parse and authenticate a server callback.
   *
   * Flitt posts either form-encoded or JSON. Both are reduced to a flat
   * parameter map before the digest is recomputed over it.
   */
  async handleWebhook(request: Request): Promise<WebhookResult> {
    const params = await readFlittBody(request);

    const signatureValid = verifyFlittSignature(
      params,
      this.config.webhookSecret,
      typeof params.signature === 'string' ? params.signature : null,
    );

    const rawStatus =
      params.order_status === undefined ? null : String(params.order_status);
    const orderId =
      params.order_id === undefined ? null : String(params.order_id);
    const providerPaymentId =
      params.payment_id === undefined ? null : String(params.payment_id);

    return {
      // payment_id is per-transaction; combined with the status it identifies
      // the delivery uniquely enough for the idempotency ledger.
      eventId: `${providerPaymentId ?? orderId ?? 'unknown'}:${rawStatus ?? 'unknown'}`,
      signatureValid,
      orderId,
      providerPaymentId,
      status: mapFlittStatus(rawStatus),
      rawStatus,
      amountMinor: params.amount === undefined ? null : Number(params.amount),
      currency: params.currency === undefined ? null : String(params.currency),
      maskedCard:
        params.masked_card === undefined ? null : String(params.masked_card),
      cardType: params.card_type === undefined ? null : String(params.card_type),
      rrn: params.rrn === undefined ? null : String(params.rrn),
      payload: params as Record<string, unknown>,
      ...(signatureValid ? {} : { rejectionReason: 'INVALID_SIGNATURE' }),
    };
  }

  async refundPayment(input: RefundInput): Promise<RefundResult> {
    const response = await this.post<Record<string, string | number>>(
      '/api/reverse/order_id',
      {
        merchant_id: this.config.merchantId,
        order_id: input.orderId,
        amount: input.amountMinor,
        currency: input.currency,
        comment: input.reason,
      },
    );

    const reverseStatus = String(response.reverse_status ?? '');
    const accepted =
      String(response.response_status ?? '') === 'success' &&
      ['approved', 'success', 'completed'].includes(
        reverseStatus.toLowerCase(),
      );

    return {
      orderId: input.orderId,
      refundId:
        response.reverse_id === undefined ? null : String(response.reverse_id),
      status: accepted ? 'ACCEPTED' : 'REJECTED',
      rawStatus: reverseStatus,
      message:
        response.response_description === undefined
          ? undefined
          : String(response.response_description),
    };
  }
}

async function readFlittBody(request: Request): Promise<FlittParams> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    // Flitt may wrap a callback in {"response": {...}}.
    const inner =
      body && typeof body === 'object' && 'response' in body
        ? (body.response as Record<string, unknown>)
        : body;
    return flatten(inner);
  }

  const form = await request.formData();
  const params: FlittParams = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params[key] = value;
  }
  return params;
}

/** Signature input is a flat map; nested objects are not part of the digest. */
function flatten(input: Record<string, unknown>): FlittParams {
  const params: FlittParams = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    params[key] = value as string | number;
  }
  return params;
}
