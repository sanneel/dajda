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

export function subscriptionHasLapsed(
  subscription: { currentPeriodEnd: Date | null; hasRenewalCalendar: boolean },
  now: Date,
): boolean {
  // No end date is an open-ended grant (a free plan), which never lapses.
  if (!subscription.currentPeriodEnd) return false;
  const grace = subscription.hasRenewalCalendar ? RENEWAL_GRACE_MS : 0;
  return subscription.currentPeriodEnd.getTime() + grace <= now.getTime();
}
