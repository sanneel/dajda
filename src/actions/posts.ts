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
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { notePostSchema } from '@/lib/validation/schemas';
import { createNote, deletePost } from '@/lib/posts/service';

/**
 * Feed actions.
 *
 * Every export starts with requireApprovedAnalyst(), which resolves the caller
 * and their profile from the session cookie. Ownership always comes from that
 * profile and never from a form field, so posting as somebody else is not
 * expressible.
 */

function fieldErrorsFrom(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function revalidateFeed(slug: string) {
  revalidatePath('/analyst');
  revalidatePath(`/analysts/${slug}`);
}

export async function postNoteAction(
  _previous: ActionResult<{ postId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ postId: string }>> {
  try {
    const analyst = await requireApprovedAnalyst();

    const limit = rateLimiter.check(
      `feed:${analyst.userId}`,
      RATE_LIMITS.feedPost,
    );
    if (!limit.allowed) {
      return fail(
        ERROR_CODES.RATE_LIMITED,
        'ძალიან ბევრი პოსტი. სცადეთ ცოტა ხანში.',
      );
    }

    const parsed = notePostSchema.safeParse({
      bodyKa: formData.get('bodyKa'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    const profile = await prisma.analystProfile.findUniqueOrThrow({
      where: { id: analyst.analystProfileId },
      select: { slug: true },
    });

    const post = await createNote(parsed.data, analyst.analystProfileId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidateFeed(profile.slug);
    return ok({ postId: post.id });
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function deletePostAction(
  _previous: ActionResult<{ deleted: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const analyst = await requireApprovedAnalyst();
    const postId = String(formData.get('postId') ?? '');
    if (!postId) return fail(ERROR_CODES.VALIDATION_ERROR);

    const profile = await prisma.analystProfile.findUniqueOrThrow({
      where: { id: analyst.analystProfileId },
      select: { slug: true },
    });

    await deletePost(postId, analyst.analystProfileId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidateFeed(profile.slug);
    return ok({ deleted: true });
  } catch (error) {
    return toActionFailure(error);
  }
}
