import { cache } from 'react';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { prisma } from '@/lib/db';
import type { PredictionVisibility } from '@/generated/prisma/enums';
import { readSession, type SessionActor } from './session';
import { satisfiesVisibility } from './entitlements';

/**
 * Authorization helpers.
 *
 * Every protected read and every mutation goes through one of these. They are
 * deliberately server-only and never trust an id supplied by the client to
 * imply ownership - the caller is always resolved from the session cookie.
 */

/** Deduplicated per request so one render does not re-query the session. */
export const getCurrentUser = cache(async (): Promise<SessionActor | null> => {
  return readSession();
});

export async function requireUser(): Promise<SessionActor> {
  const actor = await getCurrentUser();
  if (!actor) throw new AppError(ERROR_CODES.UNAUTHENTICATED);
  return actor;
}

export async function requireAdmin(): Promise<SessionActor> {
  const actor = await requireUser();
  if (actor.role !== 'ADMIN') throw new AppError(ERROR_CODES.FORBIDDEN);
  return actor;
}

/** An analyst who has actually been approved - PENDING may not publish. */
export async function requireApprovedAnalyst(): Promise<
  SessionActor & { analystProfileId: string }
> {
  const actor = await requireUser();
  if (
    actor.role === 'ADMIN' &&
    actor.analystProfileId &&
    actor.analystStatus === 'APPROVED'
  ) {
    return actor as SessionActor & { analystProfileId: string };
  }
  if (actor.role !== 'ANALYST' || !actor.analystProfileId) {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  if (actor.analystStatus !== 'APPROVED') {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'თქვენი პროფილი ჯერ არ არის დამოწმებული.',
    );
  }
  return actor as SessionActor & { analystProfileId: string };
}

/**
 * Ownership check for analyst-scoped writes. An admin may act on any profile;
 * an analyst only on their own. Prevents IDOR via a supplied profile id.
 */
export async function requireAnalystOwnership(
  analystProfileId: string,
): Promise<SessionActor> {
  const actor = await requireUser();
  if (actor.role === 'ADMIN') return actor;
  if (actor.analystProfileId !== analystProfileId) {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  return actor;
}

// The pure rule lives in ./entitlements so it is testable without Prisma.
export { satisfiesVisibility, applicableTiers } from './entitlements';

/**
 * Does `actor` hold an active subscription good enough for `visibility` on
 * `analystProfileId`?
 *
 * A platform-wide plan (analystProfileId = null on the plan) grants the tier
 * across all analysts; an analyst-scoped plan grants it for that analyst only.
 */
export async function canViewPrediction(
  actor: SessionActor | null,
  prediction: {
    id?: string;
    visibility: PredictionVisibility;
    authorId: string | null;
  },
): Promise<boolean> {
  // A community free ticket has no author and is public by construction.
  if (prediction.visibility === 'PUBLIC' || prediction.authorId === null) {
    return true;
  }
  if (!actor) return false;

  // Admins need to read everything to moderate it; the analyst owns their own.
  if (actor.role === 'ADMIN') return true;
  if (actor.analystProfileId === prediction.authorId) return true;

  // A single-ticket purchase opens exactly this bet, subscription or not.
  if (prediction.id) {
    const purchase = await prisma.predictionPurchase.findFirst({
      where: {
        userId: actor.userId,
        predictionId: prediction.id,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (purchase) return true;
  }

  const subscriptions = await prisma.userSubscription.findMany({
    where: {
      userId: actor.userId,
      status: 'ACTIVE',
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { gt: new Date() } },
      ],
      plan: {
        isActive: true,
        OR: [
          { analystProfileId: null },
          { analystProfileId: prediction.authorId },
        ],
      },
    },
    select: { plan: { select: { tier: true } } },
  });

  return satisfiesVisibility(
    subscriptions.map((subscription) => subscription.plan.tier),
    prediction.visibility,
  );
}

export async function assertCanViewPrediction(
  prediction: { visibility: PredictionVisibility; authorId: string | null },
): Promise<void> {
  const actor = await getCurrentUser();
  if (!(await canViewPrediction(actor, prediction))) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'ამ ანალიზის სანახავად საჭიროა ბილეთის შეძენა ან შესაბამისი გამოწერა.',
    );
  }
}
