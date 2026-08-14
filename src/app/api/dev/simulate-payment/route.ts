import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import {
  MOCK_EVENT_ID_HEADER,
  MOCK_SIGNATURE_HEADER,
  MOCK_TIMESTAMP_HEADER,
  signMockWebhook,
} from '@/lib/payments/mock';
import { requireUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

/**
 * Development-only gateway simulator.
 *
 * Rather than flipping the payment row directly, this signs a payload and
 * performs a genuine HTTP POST to the same webhook endpoint a real gateway
 * would call. That keeps the development path honest: if signature
 * verification, idempotency or the transition rules are broken, this breaks
 * too.
 *
 * Availability is gated on PAYMENT_PROVIDER=mock, so it cannot exist in a
 * deployment configured against a real gateway.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const env = getEnv();

  if (env.PAYMENT_PROVIDER !== 'mock') {
    return Response.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Not available' } },
      { status: 404 },
    );
  }

  try {
    // Still requires a signed-in user: this is a dev tool, not an open relay.
    const actor = await requireUser();

    const form = await request.formData();
    const orderId = String(form.get('orderId') ?? '');
    const outcome = String(form.get('outcome') ?? 'approved');
    const replayEventId = form.get('replayEventId');

    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      select: {
        id: true,
        userId: true,
        amountMinor: true,
        currency: true,
      },
    });

    if (!payment || payment.userId !== actor.userId) {
      return Response.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 },
      );
    }

    const body = JSON.stringify({
      order_id: orderId,
      payment_id: `mock-${orderId.slice(-12)}`,
      order_status: outcome,
      amount: payment.amountMinor,
      currency: payment.currency,
      masked_card: '444455XXXXXX1111',
      card_type: 'VISA',
    });

    const timestamp = Date.now();
    const signature = signMockWebhook(body, timestamp, env.MOCK_PAYMENT_SECRET);

    // Reusing an event id is how the "duplicate delivery" case is exercised.
    const eventId =
      typeof replayEventId === 'string' && replayEventId
        ? replayEventId
        : randomUUID();

    const response = await fetch(
      `${env.APP_URL}/api/webhooks/payments/mock`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [MOCK_SIGNATURE_HEADER]: signature,
          [MOCK_TIMESTAMP_HEADER]: String(timestamp),
          [MOCK_EVENT_ID_HEADER]: eventId,
        },
        body,
      },
    );

    const result = (await response.json()) as { action?: string };

    return Response.json({
      ok: true,
      data: {
        webhookStatus: response.status,
        action: result.action ?? null,
        eventId,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
