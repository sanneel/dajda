import { prisma } from '@/lib/db';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { subscriptionHasLapsed } from './expiry-rules';

/**
 * Close subscriptions whose paid month is over.
 *
 * Access already stops at currentPeriodEnd, because the access checks read it.
 * But the row would keep reading ACTIVE, and the database allows one ACTIVE
 * subscription per plan per person: without this, somebody whose month ran
 * out could never pay for the same author again. The daily payments cron runs
 * it for everyone, and a checkout runs it for the one person and plan it is
 * about to sell, so paying again on the day a month ends works.
 */
export async function expireLapsedSubscriptions(
  input: { now?: Date; userId?: string; planId?: string } = {},
): Promise<{ expired: number }> {
  const now = input.now ?? new Date();

  const candidates = await prisma.userSubscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { lte: now },
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
    },
    orderBy: { currentPeriodEnd: 'asc' },
    take: 500,
    select: {
      id: true,
      userId: true,
      currentPeriodEnd: true,
      cardToken: true,
      plan: { select: { nameKa: true } },
    },
  });

  let expired = 0;
  for (const row of candidates) {
    const lapsed = subscriptionHasLapsed(
      {
        currentPeriodEnd: row.currentPeriodEnd,
        hasRenewalCalendar: row.cardToken !== null,
      },
      now,
    );
    if (!lapsed) continue;

    await prisma.$transaction(async (tx) => {
      // Guarded by status, so a renewal that lands at the same moment wins.
      const closed = await tx.userSubscription.updateMany({
        where: { id: row.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      if (closed.count === 0) return;
      expired += 1;

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_EXPIRED,
          entityType: 'UserSubscription',
          entityId: row.id,
          summary: `გამოწერის ვადა გავიდა: ${row.plan.nameKa}`,
          actorId: row.userId,
        },
        tx,
      );
    });
  }

  return { expired };
}
