'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/authorization';
import {
  AppError,
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { startTicketPurchase } from '@/lib/tickets/purchase';

/**
 * Buy one paid prediction outright.
 *
 * On a gateway checkout this ends in a redirect to the provider and nothing
 * is granted here - access appears only when the webhook confirms payment.
 * A balance purchase grants immediately.
 */
export async function purchaseTicketAction(
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

    const predictionId = String(formData.get('predictionId') ?? '');
    if (!predictionId) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ბილეთი ვერ მოიძებნა.');
    }

    const result = await startTicketPurchase(predictionId, {
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
    });

    if (result.kind === 'PURCHASED') {
      revalidatePath(`/free/${predictionId}`);
      revalidatePath('/paid');
      revalidatePath('/dashboard');
      return ok({ status: 'PURCHASED' });
    }

    redirectTo = result.checkoutUrl;
  } catch (error) {
    return toActionFailure(error);
  }

  // redirect() throws a control-flow signal, so it must run outside try/catch.
  redirect(redirectTo);
}
