import { getPaymentProvider } from '@/lib/payments';
import { prismaWebhookPort } from '@/lib/payments/prisma-port';
import { processPaymentWebhook } from '@/lib/payments/webhook';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';

/**
 * Payment webhook - the single source of truth for activating a subscription.
 *
 * Design notes:
 *  - No session, no CSRF token: the caller is a payment gateway, authenticated
 *    by the signature over the request body, not by a cookie.
 *  - The signature is verified before any effect is applied. An unsigned or
 *    mis-signed delivery is recorded and discarded.
 *  - Replays are absorbed by the (providerCode, eventId) unique index.
 *  - We answer 200 for anything we have durably recorded, including rejects.
 *    A gateway retrying forever because we returned 500 on a message we have
 *    already stored and decided about is worse than a quiet acknowledgement,
 *    and the admin payments page surfaces every rejection.
 */
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerCode } = await params;
  const provider = getPaymentProvider();

  // Route must address the provider that is actually configured.
  if (providerCode !== provider.code) {
    return Response.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown provider' } },
      { status: 404 },
    );
  }

  let result;
  try {
    result = await provider.handleWebhook(request);
  } catch {
    // A malformed body is not retryable; do not ask the gateway to try again.
    return Response.json(
      { ok: false, error: { code: 'BAD_REQUEST', message: 'Malformed payload' } },
      { status: 400 },
    );
  }

  try {
    const outcome = await processPaymentWebhook(
      provider.code,
      result,
      prismaWebhookPort,
    );

    if (!result.signatureValid) {
      await writeAuditLog({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_REJECTED,
        entityType: 'WebhookEvent',
        entityId: result.eventId,
        summary: `webhook უარყოფილია: ${result.rejectionReason ?? 'ხელმოწერა არასწორია'}`,
        metadata: { providerCode: provider.code },
      });
    } else if (outcome.action === 'APPLIED') {
      await writeAuditLog({
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_RECEIVED,
        entityType: 'Payment',
        entityId: result.orderId ?? undefined,
        summary: `webhook გამოყენებულია: ${outcome.from} → ${outcome.to}`,
        metadata: {
          providerCode: provider.code,
          subscriptionActivated: outcome.subscriptionActivated,
        },
      });
    }

    // The body is diagnostic only; gateways key off the status code.
    return Response.json({ received: true, action: outcome.action });
  } catch (error) {
    console.error('[dajda] webhook processing failed', error);
    // A genuine server-side failure IS worth retrying, so signal 500 here.
    return Response.json(
      { ok: false, error: { code: 'INTERNAL', message: 'Processing failed' } },
      { status: 500 },
    );
  }
}
