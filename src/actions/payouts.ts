'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/authorization';
import {
  AppError,
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import {
  approvePayout,
  rejectPayout,
  requestWithdrawal,
} from '@/lib/payouts/service';
import { withdrawalSchema, payoutDecisionSchema } from '@/lib/validation/schemas';

/**
 * Ask for earnings to be paid out.
 *
 * The card number reaches this action, goes to the provider on approval, and
 * is never stored: only its masked form is written down. That is why the
 * administrator has to re-enter it to release the payout.
 */
export async function requestWithdrawalAction(
  _previous: ActionResult<{ payoutId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ payoutId: string }>> {
  try {
    const actor = await requireUser();

    const limit = rateLimiter.check(
      `withdraw:${actor.userId}`,
      RATE_LIMITS.withdrawal,
    );
    if (!limit.allowed) throw new AppError(ERROR_CODES.RATE_LIMITED);

    const parsed = withdrawalSchema.safeParse({
      amountGel: formData.get('amountGel'),
      cardNumber: formData.get('cardNumber'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const result = await requestWithdrawal(
      {
        amountMinor: Math.round(parsed.data.amountGel * 100),
        cardNumber: parsed.data.cardNumber,
      },
      { userId: actor.userId, role: actor.role },
    );

    revalidatePath('/analyst/earnings');
    revalidatePath('/admin/payouts');
    return ok({ payoutId: result.payoutId });
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Release or refuse a request. Administrators only. */
export async function decidePayoutAction(
  _previous: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const admin = await requireAdmin();

    const parsed = payoutDecisionSchema.safeParse({
      payoutId: formData.get('payoutId'),
      decision: formData.get('decision'),
      cardNumber: formData.get('cardNumber') || undefined,
      reason: formData.get('reason') || undefined,
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const input = parsed.data;

    if (input.decision === 'REJECT') {
      await rejectPayout(
        input.payoutId,
        input.reason ?? 'მიზეზი მითითებული არაა',
        { userId: admin.userId },
      );
      revalidatePath('/admin/payouts');
      return ok({ status: 'REJECTED' });
    }

    if (!input.cardNumber) {
      return fail(ERROR_CODES.VALIDATION_ERROR, undefined, {
        cardNumber: ['გასატანად შეიყვანეთ ბარათის ნომერი.'],
      });
    }

    const result = await approvePayout(input.payoutId, input.cardNumber, {
      userId: admin.userId,
    });

    revalidatePath('/admin/payouts');
    return ok({ status: result.status });
  } catch (error) {
    return toActionFailure(error);
  }
}
