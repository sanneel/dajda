import { prisma } from '@/lib/db';
import type { PaymentReturnStatus } from '@/components/payment-return';

/**
 * Resolve the `?order=` a gateway return carries into a banner status.
 *
 * Scoped to the signed-in buyer, so a pasted order id can never disclose
 * anyone else's payment. An unknown or foreign order simply shows nothing.
 */
export async function paymentReturnStatus(
  orderParam: unknown,
  userId: string | undefined,
): Promise<PaymentReturnStatus | null> {
  if (typeof orderParam !== 'string' || !orderParam.startsWith('dajda-') || !userId) {
    return null;
  }

  const payment = await prisma.payment.findFirst({
    where: { providerOrderId: orderParam, userId },
    select: { status: true },
  });
  if (!payment) return null;

  if (payment.status === 'SUCCEEDED') return 'SUCCEEDED';
  if (payment.status === 'CREATED' || payment.status === 'PROCESSING') {
    return 'PENDING';
  }
  return 'FAILED';
}
