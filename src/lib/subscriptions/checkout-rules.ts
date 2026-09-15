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

/**
 * Renewals a DAILY calendar may take before it ends by itself.
 *
 * The product's usual bound is nominal because a subscription runs until it
 * is canceled. A daily plan exists only to watch a renewal arrive on a live
 * card, so its bound is a real one: a week of charges at most, even if nobody
 * remembers to cancel.
 */
export const DAILY_TEST_MAX_RENEWALS = 7;

/**
 * The first charge's date, in UTC, because that is the date the gateway counts
 * from.
 *
 * Flitt's hosted page takes the payment's UTC date as the calendar's start and
 * computes the end date from it and `quantity`. The schedule only agrees with
 * itself when our first charge is exactly one period after that date. It was
 * once read in Tbilisi time instead: a daily plan paid at 00:30 on the 16th
 * (still the 15th in UTC) asked for a first charge on the 17th while the page
 * ended the calendar on the 22nd, and the card was declined with 2008 "Order
 * parameters are incorrect".
 */
function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function renewalRequest(
  recurring: boolean,
  billingPeriod: BillingPeriod,
  /** Start of the period this checkout is paying for - normally today. */
  periodStart: Date,
): RenewalRequest | null {
  if (!recurring) return null;

  const daily = billingPeriod === 'DAILY';

  return {
    subscription: {
      // Flitt counts in days or months; a quarter is three months.
      every: billingPeriod === 'QUARTERLY' ? 3 : 1,
      period: daily ? 'day' : 'month',
      /*
       * The calendar's first charge is the day this paid period ends. The
       * checkout has already taken today's payment, so a calendar starting
       * any earlier would charge the same period twice.
       */
      startDate: utcDate(addBillingPeriod(periodStart, billingPeriod)),
      ...(daily ? { maxRenewals: DAILY_TEST_MAX_RENEWALS } : {}),
    },
    requestCardToken: true,
  };
}
