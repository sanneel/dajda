import type {
  PlanTier,
  PredictionStatus,
  PredictionVisibility,
} from '@/generated/prisma/enums';

/**
 * Entitlement rules.
 *
 * Kept free of Prisma and env imports so the access-control matrix can be
 * unit tested directly, and so there is exactly one definition of "who may
 * read this ticket" shared by every page, the public API and the tests.
 *
 * `isTicketLocked` below is that definition. Nothing else may decide it: a
 * caller that ORs in its own exception is how a paywall develops a hole.
 */

/*
 * Three access types, and each one has exactly ONE key.
 *
 *   PUBLIC  - უფასო: free to read. An open one costs an account; a settled
 *             one is public record.
 *   PREMIUM - ფასიანი: sold singly, at the author's per-ticket price. The
 *             key is the purchase of THAT ticket and nothing else. A
 *             subscription to the author does not open it.
 *   VIP     - გამოწერა: the key is an active subscription to the author.
 *             It is not sold singly and carries no price.
 *
 * PREMIUM used to be readable by the author's subscribers as well, on the
 * theory that a subscription is the dearer product and should contain the
 * cheaper one. It does not: they are two separate things somebody paid for
 * separately, and a subscriber reading a ticket they never bought is the
 * author being paid once for two sales. Decided 2026-09-08.
 *
 * There is therefore no ordering between the tiers any more, and no rank
 * table: a key either fits a lock or it does not.
 */

/** Does the viewer hold a paying subscription that covers this author? */
export function holdsSubscriptionTo(
  plans: readonly { tier: PlanTier; analystProfileId: string | null }[],
  authorId: string,
): boolean {
  // FREE is a plan somebody can hold without paying, so it opens nothing.
  return applicableTiers(plans, authorId).some((tier) => tier !== 'FREE');
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
 * Is this ticket's CONTENT (the pick: the slip photos and the title) closed
 * to this viewer?
 *
 * Paid work stays paid, for good. Settling the bet does not open it: the
 * ticket was sold, and handing it to everybody the moment the match ends
 * would be selling the same thing twice and refunding the first buyer with
 * their own money. What stays public on a settled paid ticket is the part
 * that makes the record checkable without giving away the goods - that it
 * exists, its odds, its date and its outcome - and that lives on the rows
 * around this decision, not in the pick.
 *
 * A free or community ticket is different, because nobody bought it: while
 * it is open it costs an account, and once settled it is public record.
 *
 * Three people always get in: an administrator, who has to moderate it; the
 * author, who wrote it; and whoever paid the right way for it.
 */
export function isTicketLocked(
  ticket: TicketAccessFacts,
  viewer: TicketViewer,
  plans: readonly { tier: PlanTier; analystProfileId: string | null }[],
  /** Has this viewer bought THIS ticket outright? The only PREMIUM key. */
  hasPurchased = false,
): boolean {
  // Nobody paid for these, so the old time rule still governs them.
  if (ticket.visibility === 'PUBLIC' || ticket.authorId === null) {
    if (ticket.status !== 'PENDING') return false;
    return viewer === null;
  }

  // Paid, from here down. Signed out is never enough.
  if (!viewer) return true;
  if (viewer.role === 'ADMIN') return false;
  if (viewer.analystProfileId === ticket.authorId) return false;

  // ფასიანი: bought this ticket, or nothing. A subscription is not a key.
  if (ticket.visibility === 'PREMIUM') return !hasPurchased;

  // გამოწერა: subscribed to this author, or nothing.
  return !holdsSubscriptionTo(plans, ticket.authorId);
}
