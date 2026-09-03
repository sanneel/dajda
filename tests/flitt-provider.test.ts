import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeV2Data,
  flittSignatureV2,
  FlittPaymentProvider,
  flittSignature,
  type FlittConfig,
  type FlittParams,
} from '@/lib/payments/flitt';
import { AppError } from '@/lib/errors';

/**
 * The Flitt adapter's subscription, recurring-charge and payout paths,
 * exercised against a mocked HTTP layer. What is asserted here is the
 * request contract: endpoint, parameters, and - critically - which key
 * signed the request and what the signature covers.
 */

const CONFIG: FlittConfig = {
  merchantId: '1549901',
  secretKey: 'payment-key',
  webhookSecret: 'payment-key',
  creditKey: 'credit-key',
  apiUrl: 'https://pay.flitt.test',
};

type Sent = { url: string; request: Record<string, unknown> };

function mockGateway(response: Record<string, unknown>) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        request: Record<string, unknown>;
      };
      sent.push({ url: String(url), request: body.request });
      return new Response(JSON.stringify({ response }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('subscription checkout', () => {
  it('sends subscription=Y with the schedule and asks for a card token', async () => {
    const sent = mockGateway({
      response_status: 'success',
      checkout_url: 'https://pay.flitt.test/checkout/abc',
      payment_id: 700001,
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const session = await provider.createCheckoutSession({
      orderId: 'dajda-sub-1',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly',
      returnUrl: 'https://dajda.ge/dashboard',
      callbackUrl: 'https://dajda.ge/api/webhooks/payments/flitt',
      subscription: { every: 1, period: 'month', startDate: '2026-09-17' },
      requestCardToken: true,
    });

    expect(session.checkoutUrl).toBe('https://pay.flitt.test/checkout/abc');
    expect(sent[0]?.url).toBe('https://pay.flitt.test/api/checkout/url');

    // A subscription goes out under protocol 2.0: the order is inside the
    // base64 payload, not at the top level of the request.
    const envelope = sent[0]?.request as Record<string, unknown>;
    expect(envelope.version).toBe('2.0');
    const request = decodeV2Data(String(envelope.data));
    expect(request.subscription).toBe('Y');
    expect(request.required_rectoken).toBe('Y');
    expect(request.recurring_data).toEqual({
      every: 1,
      period: 'month',
      amount: 2900,
      // Documented format is date and time; a bare date gets midnight.
      start_time: '2026-09-17 00:00:00',
      // The gateway insists on a bound (quantity or end_time); without one
      // the card is declined with 2008 at payment time.
      quantity: 120,
      state: 'Y',
      readonly: 'Y',
    });
  });

  it('signs a subscription as one base64 payload (protocol 2.0)', async () => {
    const sent = mockGateway({
      response_status: 'success',
      checkout_url: 'https://pay.flitt.test/checkout/abc',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    await provider.createCheckoutSession({
      orderId: 'dajda-sub-2',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly',
      returnUrl: 'https://dajda.ge/dashboard',
      callbackUrl: 'https://dajda.ge/api/webhooks/payments/flitt',
      subscription: { every: 1, period: 'month' },
    });

    const envelope = sent[0]?.request as {
      version: string;
      data: string;
      signature: string;
    };

    // The flat digest cannot cover recurring_data, which is exactly what the
    // gateway refused with 1014; the 2.0 signature is sha1(secret|data).
    expect(envelope.version).toBe('2.0');
    expect(envelope.signature).toBe(
      flittSignatureV2(envelope.data, CONFIG.secretKey),
    );
    expect(Object.keys(envelope).sort()).toEqual(['data', 'signature', 'version']);
    expect(decodeV2Data(envelope.data).merchant_id).toBe(CONFIG.merchantId);
  });

  it('reads a protocol 2.0 answer from inside its payload', async () => {
    const data = Buffer.from(
      JSON.stringify({
        order: {
          checkout_url: 'https://pay.flitt.test/checkout/v2',
          payment_id: 700002,
        },
      }),
    ).toString('base64');
    mockGateway({ version: '2.0', data, signature: 'not-checked-on-answers' });

    const provider = new FlittPaymentProvider(CONFIG);
    const session = await provider.createCheckoutSession({
      orderId: 'dajda-sub-3',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly',
      returnUrl: 'https://dajda.ge/dashboard',
      callbackUrl: 'https://dajda.ge/api/webhooks/payments/flitt',
      subscription: { every: 1, period: 'month' },
    });
    expect(session.checkoutUrl).toBe('https://pay.flitt.test/checkout/v2');
    expect(session.providerPaymentId).toBe('700002');
  });

  it('leaves plain checkouts without subscription parameters', async () => {
    const sent = mockGateway({
      response_status: 'success',
      checkout_url: 'https://pay.flitt.test/checkout/abc',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    await provider.createCheckoutSession({
      orderId: 'dajda-once-1',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly',
      returnUrl: 'https://dajda.ge/dashboard',
      callbackUrl: 'https://dajda.ge/api/webhooks/payments/flitt',
    });

    const request = sent[0]?.request as Record<string, unknown>;
    expect(request.subscription).toBeUndefined();
    expect(request.recurring_data).toBeUndefined();
    expect(request.required_rectoken).toBeUndefined();
  });
});

describe('recurring charge by card token', () => {
  it('posts the token to /api/recurring and maps an approval', async () => {
    const sent = mockGateway({
      response_status: 'success',
      order_status: 'approved',
      payment_id: 700002,
      amount: 2900,
      currency: 'GEL',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const charge = await provider.chargeRecurring({
      orderId: 'dajda-renew-1',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly renewal',
      cardToken: 'rec-token-1',
    });

    expect(sent[0]?.url).toBe('https://pay.flitt.test/api/recurring');
    expect(sent[0]?.request.rectoken).toBe('rec-token-1');
    expect(charge.status).toBe('SUCCEEDED');
    expect(charge.providerPaymentId).toBe('700002');
  });

  it('maps a declined charge without inventing success', async () => {
    mockGateway({
      response_status: 'success',
      order_status: 'declined',
      payment_id: 700003,
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const charge = await provider.chargeRecurring({
      orderId: 'dajda-renew-2',
      amountMinor: 2900,
      currency: 'GEL',
      description: 'DAJDA: Monthly renewal',
      cardToken: 'rec-token-1',
    });

    expect(charge.status).toBe('FAILED');
  });

  it('raises on a gateway-level failure', async () => {
    mockGateway({
      response_status: 'failure',
      error_code: 1013,
      error_message: 'Token expired',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    await expect(
      provider.chargeRecurring({
        orderId: 'dajda-renew-3',
        amountMinor: 2900,
        currency: 'GEL',
        description: 'DAJDA: Monthly renewal',
        cardToken: 'expired-token',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('subscription start/stop', () => {
  it('addresses the calendar by the original order id', async () => {
    const sent = mockGateway({ response_status: 'success' });

    const provider = new FlittPaymentProvider(CONFIG);
    const outcome = await provider.setSubscriptionState({
      orderId: 'dajda-sub-1',
      action: 'stop',
    });

    expect(sent[0]?.url).toBe('https://pay.flitt.test/api/subscription');
    expect(sent[0]?.request).toMatchObject({
      merchant_id: '1549901',
      order_id: 'dajda-sub-1',
      action: 'stop',
    });
    expect(outcome.status).toBe('ACCEPTED');
  });

  it('reports a refusal instead of pretending it stopped', async () => {
    mockGateway({
      response_status: 'failure',
      error_message: 'Order not found',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const outcome = await provider.setSubscriptionState({
      orderId: 'unknown-order',
      action: 'stop',
    });

    expect(outcome.status).toBe('REJECTED');
    expect(outcome.message).toBe('Order not found');
  });
});

describe('payout (P2P card credit)', () => {
  it('signs with the credit key, not the payment key', async () => {
    const sent = mockGateway({
      response_status: 'success',
      order_status: 'approved',
      payment_id: 800001,
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const payout = await provider.createPayout({
      orderId: 'dajda-payout-1',
      amountMinor: 50000,
      currency: 'GEL',
      description: 'Analyst payout',
      receiverCardToken: 'analyst-card-token',
    });

    expect(sent[0]?.url).toBe('https://pay.flitt.test/api/p2pcredit');
    expect(sent[0]?.request.receiver_rectoken).toBe('analyst-card-token');
    expect(payout.status).toBe('SUCCEEDED');

    const { signature, ...params } = sent[0]?.request as Record<
      string,
      unknown
    > & { signature: string };
    expect(signature).toBe(
      flittSignature(params as FlittParams, 'credit-key'),
    );
    expect(signature).not.toBe(
      flittSignature(params as FlittParams, CONFIG.secretKey),
    );
  });

  it('refuses to run without a configured credit key', async () => {
    mockGateway({ response_status: 'success', order_status: 'approved' });

    const provider = new FlittPaymentProvider({
      ...CONFIG,
      creditKey: undefined,
    });

    await expect(
      provider.createPayout({
        orderId: 'dajda-payout-2',
        amountMinor: 50000,
        currency: 'GEL',
        description: 'Analyst payout',
        receiverCardToken: 'analyst-card-token',
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires exactly one receiver', async () => {
    mockGateway({ response_status: 'success', order_status: 'approved' });
    const provider = new FlittPaymentProvider(CONFIG);

    await expect(
      provider.createPayout({
        orderId: 'dajda-payout-3',
        amountMinor: 50000,
        currency: 'GEL',
        description: 'Analyst payout',
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      provider.createPayout({
        orderId: 'dajda-payout-4',
        amountMinor: 50000,
        currency: 'GEL',
        description: 'Analyst payout',
        receiverCardToken: 'token',
        receiverCardNumber: '4444555566661111',
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces a declined payout as FAILED', async () => {
    mockGateway({
      response_status: 'success',
      order_status: 'declined',
      response_description: 'Insufficient merchant balance',
    });

    const provider = new FlittPaymentProvider(CONFIG);
    const payout = await provider.createPayout({
      orderId: 'dajda-payout-5',
      amountMinor: 50000,
      currency: 'GEL',
      description: 'Analyst payout',
      receiverCardNumber: '4444555566661111',
    });

    expect(payout.status).toBe('FAILED');
    expect(payout.message).toBe('Insufficient merchant balance');
  });
});

describe('protocol 2.0 callbacks', () => {
  function v2Request(order: Record<string, unknown>, secret: string) {
    const data = Buffer.from(JSON.stringify({ order })).toString('base64');
    return new Request('https://dajda.ge/api/webhooks/payments/flitt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        response: { version: '2.0', data, signature: flittSignatureV2(data, secret) },
      }),
    });
  }

  it('verifies the payload digest and reads the order from inside it', async () => {
    const provider = new FlittPaymentProvider(CONFIG);
    const result = await provider.handleWebhook(
      v2Request(
        {
          order_id: 'dajda-sub-9',
          order_status: 'approved',
          payment_id: 900001,
          amount: 2900,
          currency: 'GEL',
          rectoken: 'tok_v2',
        },
        CONFIG.webhookSecret,
      ),
    );
    expect(result.signatureValid).toBe(true);
    expect(result.orderId).toBe('dajda-sub-9');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.amountMinor).toBe(2900);
    expect(result.cardToken).toBe('tok_v2');
  });

  it('rejects a payload signed with the wrong key', async () => {
    const provider = new FlittPaymentProvider(CONFIG);
    const result = await provider.handleWebhook(
      v2Request({ order_id: 'dajda-sub-9', order_status: 'approved' }, 'wrong'),
    );
    expect(result.signatureValid).toBe(false);
    expect(result.rejectionReason).toBe('INVALID_SIGNATURE');
  });
});

describe('webhook token and renewal fields', () => {
  function signedCallback(params: Record<string, string | number>) {
    return new Request('https://dajda.ge/api/webhooks/payments/flitt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...params,
        signature: flittSignature(params, CONFIG.webhookSecret),
      }),
    });
  }

  it('extracts the card token from a verified callback', async () => {
    const provider = new FlittPaymentProvider(CONFIG);
    const result = await provider.handleWebhook(
      signedCallback({
        order_id: 'dajda-sub-1',
        order_status: 'approved',
        amount: 2900,
        currency: 'GEL',
        rectoken: 'rec-token-1',
        rectoken_lifetime: '2029-01-01',
      }),
    );

    expect(result.signatureValid).toBe(true);
    expect(result.cardToken).toBe('rec-token-1');
    expect(result.cardTokenLifetime).toBe('2029-01-01');
    expect(result.parentOrderId).toBeNull();
  });

  it('extracts the parent order id from a renewal callback', async () => {
    const provider = new FlittPaymentProvider(CONFIG);
    const result = await provider.handleWebhook(
      signedCallback({
        order_id: 'flitt-generated-77',
        parent_order_id: 'dajda-sub-1',
        order_status: 'approved',
        amount: 2900,
        currency: 'GEL',
      }),
    );

    expect(result.signatureValid).toBe(true);
    expect(result.parentOrderId).toBe('dajda-sub-1');
    expect(result.orderId).toBe('flitt-generated-77');
  });
});
