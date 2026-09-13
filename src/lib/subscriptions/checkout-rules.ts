import type { BillingPeriod } from '@/generated/prisma/enums';
import type { SubscriptionSchedule } from '@/lib/payments/types';
import { addBillingPeriod } from '@/lib/payments/webhook';

/**
 * The renewal half of a subscription checkout, as a pure rule.
 *
 * Separated from the checkout itself so that what SUBSCRIPTION_RECURRING
 * actually changes can be read, and tested, without a database: the rest of
 * startSubscriptionCheckout is rows and audit entries, and the part worth
 * pinning is this - that the calendar and the token are asked for together
 * and only when renewals are on.
 *
 * Together, because the card token is not a second way of charging so much as
 * the mark that a calendar exists: the dashboard's wording, the expiry grace
 * and the cancel path all read `cardToken` to tell a renewing subscription
 * from a one-off one. A calendar opened without a token would renew silently
 * while every screen in the product called it a single month.
 */
export type RenewalRequest = {
  subscription: SubscriptionSchedule;
  requestCardToken: true;
};

export function renewalRequest(
  recurring: boolean,
  billingPeriod: BillingPeriod,
  /** Start of the period this checkout is paying for - normally today. */
  periodStart: Date,
): RenewalRequest | null {
  if (!recurring) return null;

  return {
    subscription: {
      // Flitt counts in months; a quarter is three of them.
      every: billingPeriod === 'QUARTERLY' ? 3 : 1,
      period: 'month',
      /*
       * The calendar's first charge is the day this paid period ends. The
       * checkout has already taken today's payment, so a calendar starting
       * any earlier would charge the same month twice.
       */
      startDate: addBillingPeriod(periodStart, billingPeriod)
        .toISOString()
        .slice(0, 10),
    },
    requestCardToken: true,
  };
}
