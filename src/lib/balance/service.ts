import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';

/**
 * The balance top-up flow.
 *
 * A top-up is an ordinary provider payment whose purpose is BALANCE_TOPUP:
 * it goes through the same checkout, the same webhook, the same signature
 * and amount guards as a plan payment. The balance is credited only when the
 * verified webhook lands - never when the browser comes back.
 */

/** 1 GEL. Anything smaller costs more in provider fees than it deposits. */
export const TOPUP_MIN_MINOR = 100;
/** 5000 GEL. A wallet ceiling, not a business plan. */
export const TOPUP_MAX_MINOR = 500_000;

export const BALANCE_CURRENCY = 'GEL';

export type TopUpResult = { checkoutUrl: string; orderId: string };

export async function startBalanceTopUp(
  amountMinor: number,
  actor: { userId: string; email: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
): Promise<TopUpResult> {
  if (
    !Number.isInteger(amountMinor) ||
    amountMinor < TOPUP_MIN_MINOR ||
    amountMinor > TOPUP_MAX_MINOR
  ) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'შევსების თანხა უნდა იყოს 1-დან 5000 ლარამდე.',
    );
  }

  const env = getEnv();
  const provider = getPaymentProvider();
  const orderId = `dajda-topup-${randomUUID()}`;

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        userId: actor.userId,
        purpose: 'BALANCE_TOPUP',
        providerCode: provider.code,
        providerOrderId: orderId,
        amountMinor,
        currency: BALANCE_CURRENCY,
        status: 'CREATED',
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PAYMENT_CREATED,
        entityType: 'Payment',
        entityId: orderId,
        summary: 'ბალანსის შევსება ინიცირებულია',
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: { amountMinor, purpose: 'BALANCE_TOPUP' },
      },
      tx,
    );
  });

  const session = await provider.createCheckoutSession({
    orderId,
    amountMinor,
    currency: BALANCE_CURRENCY,
    description: 'DAJDA: ბალანსის შევსება',
    returnUrl: `${env.APP_URL}/dashboard?order=${orderId}`,
    callbackUrl: `${env.APP_URL}/api/webhooks/payments/${provider.code}`,
    customerEmail: actor.email,
  });

  return { checkoutUrl: session.checkoutUrl, orderId };
}
