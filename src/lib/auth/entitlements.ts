import type {
  PlanTier,
  PredictionStatus,
  PredictionVisibility,
} from '@/generated/prisma/enums';

/**
 * Entitlement rules.
 *
 * Kept free of Prisma and env imports so the access-control matrix can be
 * unit tested directly, and so there is exactly one definition of "does this
 * plan unlock this content" shared by the page, the API and the tests.
 *
 * Plan tiers and content visibilities are separate vocabularies that happen to
 * be ordered the same way; ranking them explicitly stops FREE and PUBLIC from
 * being conflated by accident.
 */

/*
 * Three access types, two of which cost the same subscription.
 *
 *   PUBLIC  - უფასო: free to read.
 *   PREMIUM - ფასიანი: buyable on its own for the author's per-ticket price,
 *             and included for their subscribers.
 *   VIP     - გამოწერა: subscribers only. No one-off price exists for it.
 *
 * So PREMIUM and VIP rank the SAME here: what separates them is not how much
 * access they need but whether the author also offers the ticket for sale
 * singly. There is one subscription per author, and it opens both. Ranking VIP
 * above PREMIUM - as this did while VIP was a second, pricier tier - locked
 * subscription-only tickets away from the very subscribers they are for.
 */
const VISIBILITY_RANK: Record<PredictionVisibility, number> = {
  PUBLIC: 0,
  PREMIUM: 1,
  VIP: 1,
};

const PLAN_TIER_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  VIP: 2,
};

/** Does any held tier reach the required visibility? */
export function satisfiesVisibility(
  heldTiers: readonly PlanTier[],
  visibility: PredictionVisibility,
): boolean {
  if (visibility === 'PUBLIC') return true;
  const required = VISIBILITY_RANK[visibility];
  return heldTiers.some((tier) => PLAN_TIER_RANK[tier] >= required);
}

/**
 * Which of a viewer's plans apply to content by a given author?
 * A platform-wide plan (analystProfileId === null) applies everywhere; an
 * analyst-scoped plan applies only to that analyst's content.
 */
export function applicableTiers(
  plans: readonly { tier: PlanTier; analystProfileId: string | null }[],
  authorId: string,
): PlanTier[] {
  return plans
    .filter(
      (plan) =>
        plan.analystProfileId === null || plan.analystProfileId === authorId,
    )
    .map((plan) => plan.tier);
}

/** What a lock decision needs to know about a ticket. */
export type TicketAccessFacts = {
  visibility: PredictionVisibility;
  authorId: string | null;
  status: PredictionStatus;
};

/** What a lock decision needs to know about the viewer. Null = signed out. */
export type TicketViewer = {
  role: 'USER' | 'ANALYST' | 'ADMIN';
  analystProfileId: string | null;
} | null;

/**
 * Is this ticket's CONTENT (the pick: title and slip) closed to this viewer?
 *
 * The rule has a deliberate time axis. A pick is merchandise only while the
 * bet is still open (PENDING); the moment an admin settles it, it becomes part
 * of the public record - a history that hides its entries is not checkable,
 * and the checkable record is the whole product.
 *
 * While open, the price depends on the ticket: a free or community ticket
 * costs an ACCOUNT (any signed-in viewer may read it, signed-out may not),
 * and a PREMIUM/VIP ticket costs the matching subscription.
 *
 * The written analysis (description) is NOT governed here: that stays behind
 * the subscription even after settlement, which `satisfiesVisibility` already
 * decides.
 */
export function isTicketLocked(
  ticket: TicketAccessFacts,
  viewer: TicketViewer,
  plans: readonly { tier: PlanTier; analystProfileId: string | null }[],
): boolean {
  // Settled: the pick is evidence now, not merchandise.
  if (ticket.status !== 'PENDING') return false;
  // Every open pick asks for at least an account.
  if (!viewer) return true;
  // A free bet, or a community ticket, opens to any signed-in viewer.
  if (ticket.visibility === 'PUBLIC' || ticket.authorId === null) return false;
  // Admins moderate everything; the author owns their own record.
  if (viewer.role === 'ADMIN') return false;
  if (viewer.analystProfileId === ticket.authorId) return false;

  return !satisfiesVisibility(
    applicableTiers(plans, ticket.authorId),
    ticket.visibility,
  );
}
