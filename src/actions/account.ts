'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import {
  clearSessionCookie,
  revokeAllSessionsForUser,
} from '@/lib/auth/session';
import { cancelSubscription } from '@/lib/subscriptions/service';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import {
  notificationPreferencesSchema,
  updateProfileSchema,
} from '@/lib/validation/schemas';

/** Account settings. The caller is always the session user - never an id. */
export async function updateProfileAction(
  _previous: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const actor = await requireUser();

    const parsed = updateProfileSchema.safeParse({
      name: formData.get('name'),
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    await prisma.user.update({
      where: { id: actor.userId },
      // Telegram identity is set by the bot link, not typed here.
      data: { name: parsed.data.name },
    });

    revalidatePath('/dashboard/settings');
    return ok({ updated: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function updateNotificationPreferencesAction(
  _previous: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const actor = await requireUser();

    const parsed = notificationPreferencesSchema.safeParse({
      emailOnNewPrediction: formData.get('emailOnNewPrediction') === 'on',
      emailOnSettlement: formData.get('emailOnSettlement') === 'on',
      emailOnLiveSession: formData.get('emailOnLiveSession') === 'on',
      emailProductUpdates: formData.get('emailProductUpdates') === 'on',
      telegramEnabled: formData.get('telegramEnabled') === 'on',
      telegramUsername: formData.get('telegramUsername') || undefined,
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const input = parsed.data;

    await prisma.notificationPreference.upsert({
      where: { userId: actor.userId },
      create: {
        userId: actor.userId,
        emailOnNewPrediction: input.emailOnNewPrediction,
        emailOnSettlement: input.emailOnSettlement,
        emailOnLiveSession: input.emailOnLiveSession,
        emailProductUpdates: input.emailProductUpdates,
        telegramEnabled: input.telegramEnabled,
        telegramUsername: input.telegramUsername || null,
      },
      update: {
        emailOnNewPrediction: input.emailOnNewPrediction,
        emailOnSettlement: input.emailOnSettlement,
        emailOnLiveSession: input.emailOnLiveSession,
        emailProductUpdates: input.emailProductUpdates,
        telegramEnabled: input.telegramEnabled,
        telegramUsername: input.telegramUsername || null,
      },
    });

    revalidatePath('/dashboard/settings');
    return ok({ updated: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Close the account, at the person's own request.
 *
 * The register form promises "ანგარიშის დახურვა ნებისმიერ დროს შეგიძლიათ",
 * and this is that promise kept. Confirmation is the typed word "დახურვა"
 * rather than the password, because an account created through Telegram
 * login has a random password its owner never saw - a password gate would
 * make exactly those accounts uncloseable.
 *
 * WHAT CLOSING DOES, in the order that matters:
 *  1. Cancels every active subscription at the payment provider FIRST, and
 *     refuses to proceed if the gateway refuses - closing an account must
 *     never leave a card being billed for a login that no longer works.
 *  2. Marks the user DELETED, which every session read and the login path
 *     already refuse.
 *  3. Revokes all sessions and detaches Telegram, so no channel out of the
 *     account survives it.
 *
 * WHAT IT KEEPS: the ledger, payments and any published record. Money rows
 * are legal bookkeeping, and a published prediction is part of other
 * people's verifiable history - the terms say the record does not unhappen.
 * Erasure requests beyond that go through support, per the privacy policy.
 *
 * WHAT IT RELEASES: the email address and the Google binding. Both columns
 * are unique, so leaving them on a closed row would hold the mailbox and
 * the Google identity hostage forever - the person who closed an account
 * must be free to come back and open a new one. The audit row keeps the
 * original address, because "who closed this" is bookkeeping; the tombstone
 * uses the reserved .invalid TLD so it can never collide or receive mail.
 */
export async function closeAccountAction(
  _previous: ActionResult<{ closed: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ closed: true }>> {
  let closed = false;
  try {
    const actor = await requireUser();

    const confirmation = String(formData.get('confirmation') ?? '').trim();
    if (confirmation !== 'დახურვა') {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'დასადასტურებლად ჩაწერეთ სიტყვა: დახურვა',
      );
    }

    const activeSubscriptions = await prisma.userSubscription.findMany({
      where: { userId: actor.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const subscription of activeSubscriptions) {
      // Throws on a gateway refusal, which aborts the closure - see above.
      await cancelSubscription(subscription.id, {
        userId: actor.userId,
        role: actor.role,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.userId },
        data: {
          status: 'DELETED',
          email: `closed-${actor.userId}@closed.invalid`,
          emailVerifiedAt: null,
          googleId: null,
          telegramId: null,
          telegramChatId: null,
          telegramUsername: null,
          telegramLinkedAt: null,
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.USER_CLOSED_ACCOUNT,
          entityType: 'User',
          entityId: actor.userId,
          summary: `ანგარიში დაიხურა მფლობელის მოთხოვნით: ${actor.email}`,
          actorId: actor.userId,
          actorRole: actor.role,
          metadata: { canceledSubscriptions: activeSubscriptions.length },
        },
        tx,
      );
    });

    await revokeAllSessionsForUser(actor.userId);
    await clearSessionCookie();
    closed = true;
  } catch (error) {
    return toActionFailure(error);
  }
  // Outside the try: redirect() throws by design and must not be caught.
  if (closed) redirect('/');
  return ok({ closed: true });
}
