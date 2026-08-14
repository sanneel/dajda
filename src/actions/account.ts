'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
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
      telegramUsername: formData.get('telegramUsername') || undefined,
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
      data: {
        name: parsed.data.name,
        telegramUsername: parsed.data.telegramUsername || null,
      },
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
