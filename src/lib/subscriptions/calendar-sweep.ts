import { prisma } from '@/lib/db';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';

/**
 * Stop the gateway calendars of subscriptions that were canceled.
 *
 * A cancellation stops the calendar it knows about, but a calendar can be
 * unknown: until renewalOrderId existed, a first charge that came back
 * without a card token left a calendar that nothing in the product tracked,
 * and it charged 30 GEL on a subscription canceled that morning. So once a
 * day every canceled subscription's opening order is sent a stop, once.
 *
 * Stop is idempotent at the gateway and cannot charge anything. An order that
 * never had a calendar is refused, which is expected and recorded the same
 * way: each order is tried once, and the audit row says what the gateway
 * answered.
 */

/** Canceled longer ago than this has had its chance; a calendar is monthly at most. */
const LOOKBACK_MS = 400 * 24 * 60 * 60 * 1000;
const BATCH = 50;

export async function stopCanceledCalendars(
  now: Date = new Date(),
): Promise<{ stopped: number; refused: number }> {
  const provider = getPaymentProvider();

  const canceled = await prisma.userSubscription.findMany({
    where: {
      OR: [{ status: 'CANCELED' }, { cancelAtPeriodEnd: true }],
      canceledAt: { gte: new Date(now.getTime() - LOOKBACK_MS) },
    },
    select: {
      id: true,
      payments: {
        where: {
          providerCode: provider.code,
          status: { in: ['SUCCEEDED', 'REFUNDED'] },
          NOT: { providerOrderId: { startsWith: 'recurring__' } },
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { providerOrderId: true },
      },
    },
  });

  const openings = canceled.flatMap((row) =>
    row.payments.map((payment) => ({
      subscriptionId: row.id,
      orderId: payment.providerOrderId,
    })),
  );
  if (openings.length === 0) return { stopped: 0, refused: 0 };

  const done = await prisma.auditLog.findMany({
    where: {
      action: AUDIT_ACTIONS.SUBSCRIPTION_CALENDAR_SWEPT,
      entityId: { in: openings.map((opening) => opening.orderId) },
    },
    select: { entityId: true },
  });
  const seen = new Set(done.map((row) => row.entityId));

  let stopped = 0;
  let refused = 0;
  for (const opening of openings.filter((o) => !seen.has(o.orderId)).slice(0, BATCH)) {
    let accepted = false;
    let answer = '';
    try {
      const stop = await provider.setSubscriptionState({
        orderId: opening.orderId,
        action: 'stop',
      });
      accepted = stop.status === 'ACCEPTED';
      answer = `${stop.rawStatus} ${stop.message ?? ''}`.trim();
    } catch (error) {
      // Not recorded, so tomorrow's run tries again.
      console.error(`[dajda] stopping the calendar of ${opening.orderId} failed`, error);
      continue;
    }

    if (accepted) stopped += 1;
    else refused += 1;

    await writeAuditLog({
      action: AUDIT_ACTIONS.SUBSCRIPTION_CALENDAR_SWEPT,
      entityType: 'Payment',
      entityId: opening.orderId,
      summary: accepted
        ? 'გაუქმებული გამოწერის კალენდარი გაჩერდა'
        : 'გაუქმებული გამოწერის კალენდარზე გაჩერება უარყოფილია',
      metadata: { subscriptionId: opening.subscriptionId, accepted, answer },
    });
  }

  return { stopped, refused };
}
