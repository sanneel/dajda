'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/authorization';
import { startBalanceTopUp } from '@/lib/balance/service';
import {
  AppError,
  ERROR_CODES,
  fail,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { topUpSchema } from '@/lib/validation/schemas';

/**
 * Begin a balance top-up. Ends in a redirect to the payment provider; the
 * balance itself moves only when the verified webhook lands.
 */
export async function topUpBalanceAction(
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

    const parsed = topUpSchema.safeParse({
      amountGel: formData.get('amountGel'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    // Round, don't truncate: 12.999 typed into the form is 13 GEL, not 12.99.
    const amountMinor = Math.round(parsed.data.amountGel * 100);

    const result = await startBalanceTopUp(amountMinor, {
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
    });

    redirectTo = result.checkoutUrl;
  } catch (error) {
    return toActionFailure(error);
  }

  // redirect() throws a control-flow signal, so it must run outside try/catch.
  redirect(redirectTo);
}
