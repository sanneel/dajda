import { createHash, timingSafeEqual } from 'node:crypto';
import type { PaymentStatus } from '@/generated/prisma/enums';
import { AppError, ERROR_CODES } from '@/lib/errors';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  PaymentVerification,
  PayoutInput,
  PayoutResult,
  RecurringChargeInput,
  RefundInput,
  RefundResult,
  SubscriptionActionInput,
  SubscriptionActionResult,
  VerifyPaymentInput,
  WebhookResult,
} from './types';

/**
 * Flitt adapter - implemented against the published API reference
 * (https://docs.flitt.com).
 *
 * Covers hosted checkout (optionally with a gateway-managed subscription
 * calendar and/or a reusable card token), status checks, refunds, recurring
 * charges against a stored token, subscription start/stop, and payouts
 * (P2P card credit, signed with the separate credit key).
 *
 * Signature algorithm, per docs.flitt.com/api/building-signature:
 *   1. take every parameter except `signature` and `response_signature_string`
 *   2. drop parameters that are absent or empty (a literal 0 is NOT empty)
 *   3. sort the remaining parameters by key, alphabetically
 *   4. join their values with "|", with the merchant payment key prepended
 *   5. SHA-1 the result, lowercase hex
 *
 * That digest covers scalar parameters only, so a request that carries a
 * nested object - a subscription's recurring_data - cannot be signed with
 * it; the gateway answers 1014 "Invalid signature". Flitt's own SDK
 * switches such requests to protocol 2.0: the whole order is JSON-encoded
 * as {"order": {...}}, base64'd, and that one string is signed as
 * sha1(secret + "|" + data). The envelope is {"version":"2.0","data":…,
 * "signature":…} and the answer comes back in the same shape.
 *
 * STATUS: written to the documented specification but never exercised against
 * a live merchant account, because no credentials exist in this environment.
 * The pure functions below are unit tested against the worked example in the
 * documentation; the HTTP calls are the part still awaiting a real sandbox.
 */

export const FLITT_PROVIDER_CODE = 'flitt';

/** Parameters the gateway adds to a response but excludes from the digest. */
const SIGNATURE_EXCLUDED = new Set(['signature', 'response_signature_string']);

export type FlittScalar = string | number | null | undefined;
export type FlittParams = Record<
  string,
  FlittScalar | Record<string, FlittScalar>
>;

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
    // Absent and empty are skipped; 0 and "0" are kept. Nested objects such
    // as recurring_data carry the subscription schedule but are not part of
    // the digest - only scalar parameters are signed.
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== '' &&
        typeof value !== 'object',
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

/** Protocol 2.0: the base64 payload is the only thing signed. */
export function flittSignatureV2(data: string, secretKey: string): string {
  return createHash('sha1')
    .update(`${secretKey}|${data}`, 'utf8')
    .digest('hex')
    .toLowerCase();
}

export type FlittV2Envelope = { version: '2.0'; data: string; signature: string };

/** Wrap an order for a protocol 2.0 request. */
export function encodeV2Order(
  order: FlittParams,
  secretKey: string,
): FlittV2Envelope {
  const data = Buffer.from(JSON.stringify({ order }), 'utf8').toString('base64');
  return { version: '2.0', data, signature: flittSignatureV2(data, secretKey) };
}

/** Unwrap a protocol 2.0 payload; throws on anything that is not one. */
export function decodeV2Data(data: string): Record<string, unknown> {
  const parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
    order?: Record<string, unknown>;
  };
  if (!parsed || typeof parsed !== 'object' || !parsed.order) {
    throw new Error('protocol 2.0 payload has no order');
  }
  return parsed.order;
}

function isV2Envelope(value: unknown): value is FlittV2Envelope {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { version?: unknown }).version === '2.0' &&
    typeof (value as { data?: unknown }).data === 'string'
  );
}

function digestsEqual(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Constant-time comparison of two hex digests. */
export function verifyFlittSignature(
  params: FlittParams,
  secretKey: string,
  provided: string | null | undefined,
): boolean {
  return digestsEqual(flittSignature(params, secretKey), provided);
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
  /**
   * Separate "credit" private key issued for payout (P2P card credit)
   * operations. Payouts are refused when it is not configured; the payment
   * key is never a substitute.
   */
  creditKey?: string;
  apiUrl: string;
};

type FlittEnvelope<T> = { response: T };

export class FlittPaymentProvider implements PaymentProvider {
  readonly code = FLITT_PROVIDER_CODE;

  constructor(private readonly config: FlittConfig) {}

  private async post<T>(
    path: string,
    request: FlittParams,
    signingKey: string = this.config.secretKey,
    protocol: '1.0' | '2.0' = '1.0',
  ): Promise<T> {
    const signed =
      protocol === '2.0'
        ? encodeV2Order(request, signingKey)
        : { ...request, signature: flittSignature(request, signingKey) };

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
    // A 2.0 answer is wrapped the same way the request was, though not
    // always with a version field: Flitt's SDK decodes any answer that
    // carries a data string and falls back to the raw answer otherwise. An
    // error answer to a 2.0 request may still come back flat.
    const answer = body.response as unknown;
    if (
      answer &&
      typeof answer === 'object' &&
      typeof (answer as { data?: unknown }).data === 'string' &&
      (protocol === '2.0' || isV2Envelope(answer))
    ) {
      try {
        return decodeV2Data((answer as { data: string }).data) as T;
      } catch {
        return body.response;
      }
    }
    return body.response;
  }

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutSession> {
    const request: FlittParams = {
      merchant_id: this.config.merchantId,
      order_id: input.orderId,
      // Flitt expects the amount in minor units, which is how we store it.
      amount: input.amountMinor,
      currency: input.currency,
      order_desc: input.description,
      server_callback_url: input.callbackUrl,
      response_url: input.returnUrl,
      sender_email: input.customerEmail,
    };

    if (input.requestCardToken) {
      // The callback will then carry `rectoken`, our WebhookResult.cardToken.
      request.required_rectoken = 'Y';
    }

    if (input.subscription) {
      // docs.flitt.com/api/subscriptions: subscription=Y plus a recurring_data
      // object makes the gateway charge the card on its own calendar. The
      // checkout takes the first payment; start_time is when renewals begin.
      // recurring_data is nested and therefore outside the signature.
      request.subscription = 'Y';
      request.recurring_data = {
        every: input.subscription.every,
        period: input.subscription.period,
        amount: input.amountMinor,
        // Documented format is "YYYY-MM-DD HH24:MI:SS"; a bare date gets
        // midnight appended. Absent means "from the initial payment".
        start_time: withMidnight(input.subscription.startDate),
        // The customer pays what the plan costs; the hosted page must not
        // let them edit the schedule.
        state: 'Y',
        readonly: 'Y',
      };
    }

    const response = await this.post<{
      response_status?: string;
      checkout_url?: string;
      payment_id?: number | string;
      error_message?: string;
      error_code?: number;
    }>(
      '/api/checkout/url',
      request,
      this.config.secretKey,
      // Nested recurring_data cannot be signed under 1.0 (see header).
      input.subscription ? '2.0' : '1.0',
    );

    if (response.response_status !== 'success' || !response.checkout_url) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        // The raw answer (truncated) goes to the log too: a refusal that
        // names neither code nor message is otherwise undiagnosable.
        internalDetail: `Flitt checkout failed: ${response.error_code ?? '?'} ${
          response.error_message ?? 'unknown'
        } :: ${JSON.stringify(response).slice(0, 400)}`,
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
    const body = await readFlittBody(request);

    let params: FlittParams;
    let signatureValid: boolean;
    if (body.v2) {
      // Protocol 2.0 callback: the digest covers the base64 payload, and
      // the parameters live inside it. An undecodable payload is a
      // rejected delivery, not a crash.
      signatureValid = digestsEqual(
        flittSignatureV2(body.v2.data, this.config.webhookSecret),
        body.v2.signature,
      );
      try {
        params = flatten(decodeV2Data(body.v2.data));
      } catch {
        params = {};
        signatureValid = false;
      }
    } else {
      params = body.params;
      signatureValid = verifyFlittSignature(
        params,
        this.config.webhookSecret,
        typeof params.signature === 'string' ? params.signature : null,
      );
    }

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
      // Issued when the checkout asked for required_rectoken=Y. An opaque
      // token, never a PAN, safe to persist.
      cardToken: asOptionalString(params.rectoken),
      cardTokenLifetime: asOptionalString(params.rectoken_lifetime),
      // Present on charges the gateway initiated from a subscription
      // calendar; names the original checkout order.
      parentOrderId: asOptionalString(params.parent_order_id),
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

  /**
   * Charge a stored card token (docs.flitt.com: /api/recurring). The gateway
   * answers synchronously with the same vocabulary as an order status check;
   * the server callback, when requested, remains the source of truth.
   */
  async chargeRecurring(
    input: RecurringChargeInput,
  ): Promise<PaymentVerification> {
    const response = await this.post<Record<string, string | number>>(
      '/api/recurring',
      {
        merchant_id: this.config.merchantId,
        order_id: input.orderId,
        order_desc: input.description,
        amount: input.amountMinor,
        currency: input.currency,
        rectoken: input.cardToken,
        server_callback_url: input.callbackUrl,
      },
    );

    if (String(response.response_status ?? '') === 'failure') {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `Flitt recurring failed: ${response.error_code ?? '?'} ${
          response.error_message ?? 'unknown'
        }`,
      });
    }

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
   * Pause or resume the renewal calendar created by a subscription checkout
   * (docs.flitt.com/api/cancel-subscriptions: /api/subscription with
   * action=start|stop, addressed by the original order_id).
   */
  async setSubscriptionState(
    input: SubscriptionActionInput,
  ): Promise<SubscriptionActionResult> {
    const response = await this.post<Record<string, string | number>>(
      '/api/subscription',
      {
        merchant_id: this.config.merchantId,
        order_id: input.orderId,
        action: input.action,
      },
    );

    const rawStatus = String(response.response_status ?? '');

    return {
      orderId: input.orderId,
      action: input.action,
      status: rawStatus === 'success' ? 'ACCEPTED' : 'REJECTED',
      rawStatus,
      message:
        response.error_message === undefined
          ? undefined
          : String(response.error_message),
    };
  }

  /**
   * Credit funds to a card (docs.flitt.com: /api/p2pcredit). Signed with the
   * dedicated credit key, which the merchant receives separately from the
   * payment key precisely so that a leaked payment key cannot move money out.
   */
  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    if (!this.config.creditKey) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail:
          'Flitt payout refused: FLITT_CREDIT_KEY is not configured',
      });
    }

    if (!input.receiverCardToken === !input.receiverCardNumber) {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail:
          'Flitt payout needs exactly one of receiverCardToken / receiverCardNumber',
      });
    }

    const response = await this.post<Record<string, string | number>>(
      '/api/p2pcredit',
      {
        merchant_id: this.config.merchantId,
        order_id: input.orderId,
        order_desc: input.description,
        amount: input.amountMinor,
        currency: input.currency,
        receiver_rectoken: input.receiverCardToken,
        receiver_card_number: input.receiverCardNumber,
      },
      this.config.creditKey,
    );

    if (String(response.response_status ?? '') === 'failure') {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `Flitt payout failed: ${response.error_code ?? '?'} ${
          response.error_message ?? 'unknown'
        }`,
      });
    }

    const rawStatus = String(response.order_status ?? '');
    const status: PayoutResult['status'] =
      rawStatus.toLowerCase() === 'approved'
        ? 'SUCCEEDED'
        : rawStatus.toLowerCase() === 'declined'
          ? 'FAILED'
          : 'PROCESSING';

    return {
      orderId: input.orderId,
      providerPaymentId:
        response.payment_id === undefined ? null : String(response.payment_id),
      status,
      rawStatus,
      message:
        response.response_description === undefined
          ? undefined
          : String(response.response_description),
    };
  }
}

function asOptionalString(value: unknown): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : String(value);
}

type FlittBody = {
  params: FlittParams;
  v2: { data: string; signature: string | null } | null;
};

async function readFlittBody(request: Request): Promise<FlittBody> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    // Flitt may wrap a callback in {"response": {...}}.
    const inner =
      body && typeof body === 'object' && 'response' in body
        ? (body.response as Record<string, unknown>)
        : body;
    if (isV2Envelope(inner)) {
      return {
        params: {},
        v2: { data: inner.data, signature: asOptionalString(inner.signature) },
      };
    }
    return { params: flatten(inner), v2: null };
  }

  const form = await request.formData();
  const params: FlittParams = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params[key] = value;
  }
  if (isV2Envelope(params)) {
    return {
      params: {},
      v2: { data: params.data, signature: asOptionalString(params.signature) },
    };
  }
  return { params, v2: null };
}

/** "2026-09-17" -> "2026-09-17 00:00:00"; anything already timed passes. */
function withMidnight(date: string | undefined): string | undefined {
  if (!date) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date} 00:00:00` : date;
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
