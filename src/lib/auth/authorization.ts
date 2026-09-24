import { cache } from 'react';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { readSession, type SessionActor } from './session';

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
