'use server';

import { revalidatePath } from 'next/cache';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { storeScreenshot } from '@/lib/uploads';
import {
  createPredictionSchema,
  markFinishedSchema,
} from '@/lib/validation/schemas';
import {
  createPrediction,
  markPredictionFinished,
  publishPrediction,
} from '@/lib/predictions/service';

/**
 * Actions an analyst performs on their own bets.
 *
 * Every export begins with requireApprovedAnalyst(), which resolves the caller and
 * their analyst profile from the session cookie server-side. Ownership is
 * always taken from that profile, never from a form field, so posting as
 * somebody else is not expressible.
 */

function fieldErrorsFrom(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Post a bet.
 *
 * The screenshot arrives in the same submission as the rest of the form and is
 * stored first, because a bet row without its evidence is not worth writing.
 * If the upload is rejected, nothing is created.
 */
export async function postBetAction(
  _previous: ActionResult<{ predictionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ predictionId: string }>> {
  try {
    const analyst = await requireApprovedAnalyst();

    // Uploads are expensive and are the one endpoint worth flooding.
    const limit = rateLimiter.check(
      `bet:${analyst.userId}`,
      RATE_LIMITS.postBet,
    );
    if (!limit.allowed) {
      return fail(
        ERROR_CODES.RATE_LIMITED,
        'ძალიან ბევრი მცდელობა. სცადეთ ცოტა ხანში.',
      );
    }

    const slip = formData.get('screenshot');
    if (!(slip instanceof File) || slip.size === 0) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ატვირთეთ ფსონის სკრინშოტი.', {
        screenshot: ['ატვირთეთ ფსონის სკრინშოტი.'],
      });
    }

    const stored = await storeScreenshot(slip);

    const parsed = createPredictionSchema.safeParse({
      sportId: formData.get('sportId'),
      screenshotPath: stored.urlPath,
      titleKa: formData.get('titleKa'),
      descriptionKa: formData.get('descriptionKa') || undefined,
      odds: formData.get('odds'),
      stakeUnits: formData.get('stakeUnits') || 1,
      confidence: formData.get('confidence') || 'MEDIUM',
      visibility: formData.get('visibility') || 'PUBLIC',
      eventAt: formData.get('eventAt') || undefined,
      publishNow: formData.get('publishNow') !== 'off',
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    const prediction = await createPrediction(
      parsed.data,
      analyst.analystProfileId,
      { userId: analyst.userId, role: analyst.role },
    );

    revalidatePath('/analyst');
    revalidatePath('/free');
    revalidatePath('/analysts');

    return ok({ predictionId: prediction.id });
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Publish a draft the author saved earlier. */
export async function publishBetAction(
  _previous: ActionResult<{ published: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ published: true }>> {
  try {
    const analyst = await requireApprovedAnalyst();
    const predictionId = String(formData.get('predictionId') ?? '');
    if (!predictionId) return fail(ERROR_CODES.VALIDATION_ERROR);

    await publishPrediction(predictionId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidatePath('/analyst');
    revalidatePath('/free');
    return ok({ published: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Mark a bet finished and hand it to an admin.
 *
 * The result screenshot is optional. An admin can still settle without one,
 * so a missing image slows review down rather than blocking the author.
 */
export async function markBetFinishedAction(
  _previous: ActionResult<{ finished: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ finished: true }>> {
  try {
    const analyst = await requireApprovedAnalyst();

    const proof = formData.get('resultScreenshot');
    let resultScreenshotPath: string | undefined;

    if (proof instanceof File && proof.size > 0) {
      const stored = await storeScreenshot(proof);
      resultScreenshotPath = stored.urlPath;
    }

    const parsed = markFinishedSchema.safeParse({
      predictionId: formData.get('predictionId'),
      resultScreenshotPath,
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    await markPredictionFinished(parsed.data, analyst.analystProfileId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidatePath('/analyst');
    revalidatePath('/admin/predictions');
    return ok({ finished: true });
  } catch (error) {
    return toActionFailure(error);
  }
}
