import { prisma } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payments';
import { notifyAdminsUnwantedRenewal } from '@/lib/notifications/admin-alerts';

/**
 * What follows a renewal the gateway charged on a subscription that had been
 * canceled (RENEWAL_UNWANTED).
 *
 * It happens when a calendar outlives the cancellation: the gateway refused
 * the stop, or the calendar was never known to exist. On 2026-10-04 a
 * subscription canceled that morning was charged 30 GEL in the afternoon,
 * because its first charge came back without a card token and nothing in the
 * product knew it renewed. The person asked not to pay, so:
 *
 *   - stop the calendar, so it does not happen again next period
 *   - refund this charge. Its callback then marks the payment REFUNDED and
 *     takes back the analyst's share, like any other refund.
 *   - tell the administrators, naming the order for anything that failed
 *
 * Each on its own, so one failing does not stop the others. Never throws: the
 * charge is already recorded, and a gateway hiccup must not turn the webhook
 * into a 500 the gateway retries.
 */
export async function settleUnwantedRenewal(
  parentOrderId: string,
  renewalOrderId: string,
): Promise<void> {
  const provider = getPaymentProvider();

  let calendarStopped = false;
  try {
    const stop = await provider.setSubscriptionState({
      orderId: parentOrderId,
      action: 'stop',
    });
    calendarStopped = stop.status === 'ACCEPTED';
    if (!calendarStopped) {
      console.error(
        `[dajda] gateway refused to stop the calendar of ${parentOrderId}: ${stop.rawStatus} ${stop.message ?? ''}`,
      );
    }
  } catch (error) {
    console.error(`[dajda] stopping the calendar of ${parentOrderId} failed`, error);
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: renewalOrderId },
      select: {
        amountMinor: true,
        currency: true,
        plan: { select: { nameKa: true } },
      },
    });
    if (!payment) return;

    let refunded = false;
    try {
      const refund = await provider.refundPayment({
        orderId: renewalOrderId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reason: 'renewal charged after cancellation',
      });
      refunded = refund.status === 'ACCEPTED';
      if (!refunded) {
        console.error(
          `[dajda] gateway refused to refund ${renewalOrderId}: ${refund.rawStatus} ${refund.message ?? ''}`,
        );
      }
    } catch (error) {
      console.error(`[dajda] refunding ${renewalOrderId} failed`, error);
    }

    await notifyAdminsUnwantedRenewal({
      planName: payment.plan?.nameKa ?? 'გამოწერა',
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      renewalOrderId,
      parentOrderId,
      refunded,
      calendarStopped,
    });
  } catch (error) {
    console.error(`[dajda] unwanted-renewal follow-up for ${renewalOrderId} failed`, error);
  }
}
