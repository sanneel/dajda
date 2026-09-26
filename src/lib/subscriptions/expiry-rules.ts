import type { Prisma } from '@/generated/prisma/client';

/**
 * When a subscription's paid month is over, as a pure rule.
 *
 * A subscription with a renewal calendar at the gateway (it carries a card
 * token) is given a few days' grace, so a renewal the gateway charges on the
 * day still extends it instead of arriving at a row that has already closed.
 * One sold without a calendar has nothing in flight to wait for and ends on
 * its own date.
 */

export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * How long access outlasts the paid period while its renewal is due.
 *
 * The gateway charges on the date the period ends, but at an hour of its own:
 * a calendar sent "2026-09-27 00:00:00" was scheduled for 12:31 that day, an
 * hour after the paid day had run out, and a renewing subscriber found their
 * tickets locked until the charge arrived. A day covers any hour of that
 * date. It is shorter than RENEWAL_GRACE_MS on purpose: that one keeps the
 * row open for the renewal, this one opens the door, and a declined renewal
 * should cost at most the day the charge could still have landed in.
 */
export const RENEWAL_ACCESS_GRACE_MS = 24 * 60 * 60 * 1000;

export function subscriptionHasLapsed(
  subscription: { currentPeriodEnd: Date | null; hasRenewalCalendar: boolean },
  now: Date,
): boolean {
  // No end date is an open-ended grant (a free plan), which never lapses.
  if (!subscription.currentPeriodEnd) return false;
  const grace = subscription.hasRenewalCalendar ? RENEWAL_GRACE_MS : 0;
  return subscription.currentPeriodEnd.getTime() + grace <= now.getTime();
}

/** The earliest period end that still grants access at `now`. */
function accessCutoff(hasRenewalCalendar: boolean, now: Date): Date {
  const grace = hasRenewalCalendar ? RENEWAL_ACCESS_GRACE_MS : 0;
  return new Date(now.getTime() - grace);
}

/** Whether an ACTIVE subscription opens its plan's tickets at `now`. */
export function subscriptionGrantsAccess(
  subscription: { currentPeriodEnd: Date | null; hasRenewalCalendar: boolean },
  now: Date,
): boolean {
  if (!subscription.currentPeriodEnd) return true;
  return (
    subscription.currentPeriodEnd > accessCutoff(subscription.hasRenewalCalendar, now)
  );
}

/**
 * subscriptionGrantsAccess as a query filter, for the reads that decide
 * access in the database. Built from the same cutoff, so the two cannot
 * disagree about when the door closes.
 */
export function grantsAccessWhere(now: Date) {
  return {
    OR: [
      { currentPeriodEnd: null },
      { currentPeriodEnd: { gt: accessCutoff(false, now) } },
      {
        cardToken: { not: null },
        currentPeriodEnd: { gt: accessCutoff(true, now) },
      },
    ],
  } satisfies Prisma.UserSubscriptionWhereInput;
}
