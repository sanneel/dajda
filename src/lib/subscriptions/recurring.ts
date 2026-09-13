import { getEnv } from '@/lib/env';
import { TERMS_BILLING_MODE } from '@/lib/legal/billing-mode.generated';

/**
 * Whether subscriptions actually renew - the one place that decides.
 *
 * Two things have to agree: SUBSCRIPTION_RECURRING, which says what the
 * operator wants, and the billing-mode marker in docs/legal/terms.md, which
 * says what the published terms promise a card will do. A charge the customer
 * did not initiate is only defensible if the terms they agreed to describe it,
 * so when the two disagree the terms win and subscriptions are sold one month
 * at a time.
 *
 * This used to be an environment guard that refused to parse at all, which
 * meant a single wrong variable took down every page rather than the one
 * feature it was about - env is read by the site header, so the whole site
 * answered 500 while the deployment reported success. A contradiction is now
 * caught before it can deploy (scripts/check-billing-config.mjs, wired into
 * vercel-build) and, if one arises anyway, it degrades here instead: the site
 * stays up selling what the terms describe, /api/health reports it, and the
 * log says so.
 *
 * Every caller reads this rather than the raw variable - the checkout, and all
 * the copy that tells a buyer what their card will do - so what the site
 * promises and what it performs cannot come apart.
 */

let warned = false;

/** The declared intent and the terms disagree; the terms are being followed. */
export function recurringBillingContradicted(): boolean {
  return getEnv().SUBSCRIPTION_RECURRING && TERMS_BILLING_MODE !== 'recurring';
}

export function recurringBillingEnabled(): boolean {
  if (!getEnv().SUBSCRIPTION_RECURRING) return false;

  if (TERMS_BILLING_MODE !== 'recurring') {
    // Once per process: this is a deployment mistake, not a per-request event,
    // and a line on every render would bury it.
    if (!warned) {
      warned = true;
      console.error(
        '[dajda] SUBSCRIPTION_RECURRING is "true" but docs/legal/terms.md is ' +
          'marked billing-mode: oneoff, so subscriptions are NOT renewing. ' +
          'Update the clauses (docs/legal/recurring-billing-clauses.md), flip ' +
          'the marker, and run `npm run legal:sync`.',
      );
    }
    return false;
  }

  return true;
}

/** Test helper - forget that the warning has already been printed. */
export function resetRecurringWarning(): void {
  warned = false;
}
