'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/authorization';
import { AppError, ERROR_CODES, fail, ok, toActionFailure, type ActionResult } from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import {
  cancelSubscriptionSchema,
  saveAnalystSchema,
  subscribeSchema,
} from '@/lib/validation/schemas';
import {
  cancelSubscription,
  startSubscriptionCheckout,
} from '@/lib/subscriptions/service';
import { prisma } from '@/lib/db';

/**
 * Begin a subscription.
 *
 * On a paid plan this ends in a redirect to the provider. Nothing is activated
 * here - the subscription stays PENDING until the webhook confirms payment.
 */
export async function startCheckoutAction(
  _previous: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  let redirectTo: string | null = null;

  try {
    const actor = await requireUser();

    const limit = rateLimiter.check(
      `checkout:${actor.userId}`,
      RATE_LIMITS.checkout,
    );
    if (!limit.allowed) throw new AppError(ERROR_CODES.RATE_LIMITED);

    const parsed = subscribeSchema.safeParse({
      planId: formData.get('planId'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const result = await startSubscriptionCheckout(parsed.data.planId, {
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
    });

    if (result.kind === 'ACTIVATED') {
      revalidatePath('/dashboard');
      return ok({ status: 'ACTIVATED' });
    }

    redirectTo = result.checkoutUrl;
  } catch (error) {
    return toActionFailure(error);
  }

  // redirect() throws a control-flow signal, so it must run outside try/catch.
  redirect(redirectTo);
}

export async function cancelSubscriptionAction(
  _previous: ActionResult<{ canceled: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ canceled: true }>> {
  try {
    const actor = await requireUser();

    const parsed = cancelSubscriptionSchema.safeParse({
      subscriptionId: formData.get('subscriptionId'),
    });
    if (!parsed.success) {
      return fail(ERROR_CODES.VALIDATION_ERROR);
    }

    await cancelSubscription(parsed.data.subscriptionId, {
      userId: actor.userId,
      role: actor.role,
    });

    revalidatePath('/dashboard');
    return ok({ canceled: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Add or remove an analyst from the viewer's saved list. */
export async function toggleSavedAnalystAction(
  _previous: ActionResult<{ saved: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const actor = await requireUser();

    const parsed = saveAnalystSchema.safeParse({
      analystProfileId: formData.get('analystProfileId'),
    });
    if (!parsed.success) return fail(ERROR_CODES.VALIDATION_ERROR);

    const { analystProfileId } = parsed.data;

    const existing = await prisma.savedAnalyst.findUnique({
      where: {
        userId_analystProfileId: { userId: actor.userId, analystProfileId },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.savedAnalyst.delete({ where: { id: existing.id } });
      revalidatePath('/dashboard');
      return ok({ saved: false });
    }

    const analyst = await prisma.analystProfile.count({
      where: { id: analystProfileId, status: 'APPROVED' },
    });
    if (analyst === 0) throw new AppError(ERROR_CODES.NOT_FOUND);

    await prisma.savedAnalyst.create({
      data: { userId: actor.userId, analystProfileId },
    });

    revalidatePath('/dashboard');
    return ok({ saved: true });
  } catch (error) {
    return toActionFailure(error);
  }
}
