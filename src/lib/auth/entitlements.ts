import type { PlanTier, PredictionVisibility } from '@/generated/prisma/enums';

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

const VISIBILITY_RANK: Record<PredictionVisibility, number> = {
  PUBLIC: 0,
  PREMIUM: 1,
  VIP: 2,
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
