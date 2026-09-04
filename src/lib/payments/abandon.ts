import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

/**
 * Undo a checkout the gateway refused to open.
 *
 * The payment row (and, for a subscription, the PENDING subscription) is
 * written before the provider is asked for a checkout URL, so a refusal
 * used to leave both behind: the buyer saw "could not process payment" and
 * then, on the next visit, "awaiting confirmation" on a card they could no
 * longer press. Nothing was ever going to confirm it. This marks the
 * payment FAILED with the reason, and cancels the subscription, so the
 * buyer can simply try again.
 */
export async function abandonRefusedCheckout(input: {
  orderId: string;
  subscriptionId?: string;
  reason: string;
}): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = await tx.payment.findUnique({
      where: { providerOrderId: input.orderId },
      select: { id: true, status: true },
    });
    if (payment && payment.status === 'CREATED') {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      await tx.paymentStatusTransition.create({
        data: {
          paymentId: payment.id,
          fromStatus: 'CREATED',
          toStatus: 'FAILED',
          source: 'SYSTEM',
          reason: input.reason.slice(0, 500),
        },
      });
    }
    if (input.subscriptionId) {
      await tx.userSubscription.updateMany({
        where: { id: input.subscriptionId, status: 'PENDING' },
        data: { status: 'CANCELED', canceledBy: 'SYSTEM' },
      });
    }
  });
}
