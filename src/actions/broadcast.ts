'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { broadcastSchema } from '@/lib/validation/schemas';
import { sendBroadcast, type BroadcastResult } from '@/lib/notifications/broadcast';

/**
 * Send a broadcast.
 *
 * The audience and the daily cap are both derived server-side from the
 * caller's own profile, so neither "who receives this" nor "how many have I
 * sent" is expressible from the form.
 */
export async function sendBroadcastAction(
  _previous: ActionResult<BroadcastResult> | null,
  formData: FormData,
): Promise<ActionResult<BroadcastResult>> {
  try {
    const analyst = await requireApprovedAnalyst();

    const parsed = broadcastSchema.safeParse({
      subjectKa: formData.get('subjectKa'),
      bodyKa: formData.get('bodyKa'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const profile = await prisma.analystProfile.findUniqueOrThrow({
      where: { id: analyst.analystProfileId },
      select: { slug: true, displayName: true },
    });

    // The daily cap lives in sendBroadcast, counted in the database, and
    // surfaces here as a RATE_LIMITED AppError.
    const result = await sendBroadcast(
      parsed.data,
      {
        analystProfileId: analyst.analystProfileId,
        slug: profile.slug,
        displayName: profile.displayName,
      },
      { userId: analyst.userId, role: analyst.role },
    );

    revalidatePath('/analyst');
    return ok(result);
  } catch (error) {
    return toActionFailure(error);
  }
}
