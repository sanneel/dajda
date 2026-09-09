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
import {
  payoutWindowSchema,
  withdrawalSchema,
  payoutDecisionSchema,
} from '@/lib/validation/schemas';
import { prisma } from '@/lib/db';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';

/**
 * Ask for earnings to be paid out.
 *
 * The IBAN reaches this action, is sealed with the request, and goes to the
 * provider on approval. Only its masked form outlives the decision.
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
      iban: formData.get('iban'),
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
        iban: parsed.data.iban,
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
      iban: formData.get('iban') || undefined,
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
      revalidatePath('/admin', 'layout');
      return ok({ status: 'REJECTED' });
    }

    // The account normally comes sealed with the request; a typed one is the
    // fallback for requests that carry none, and is checked against the mask.
    const result = await approvePayout(
      input.payoutId,
      { userId: admin.userId },
      input.iban,
    );

    revalidatePath('/admin', 'layout');
    return ok({ status: result.status });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Open or hold one author's withdrawal window.
 *
 * The agreement's calendar - the last day of the month - stays the default
 * and the norm. This exists for the cases the calendar cannot see: an author
 * who could not reach the window, money owed today after a correction, or a
 * month under dispute that should not pay out even though it is the 31st.
 *
 * It changes only WHEN a request may be made. Every other guard is untouched:
 * the request still holds the earnings, the activity check still travels with
 * it, and an administrator still has to release the money by hand. Nothing
 * here moves a tetri.
 */
export async function setPayoutWindowAction(
  _previous: ActionResult<{ window: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ window: string }>> {
  try {
    const admin = await requireAdmin();

    const parsed = payoutWindowSchema.safeParse({
      analystProfileId: formData.get('analystProfileId'),
      window: formData.get('window'),
      note: formData.get('note') || undefined,
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const { analystProfileId, window, note } = parsed.data;

    const profile = await prisma.analystProfile.findUnique({
      where: { id: analystProfileId },
      select: { id: true, displayName: true, payoutWindow: true },
    });
    if (!profile) throw new AppError(ERROR_CODES.NOT_FOUND);

    await prisma.analystProfile.update({
      where: { id: profile.id },
      data: {
        payoutWindow: window,
        // Back on the calendar carries no note: the reason it was off it has
        // already been written down, and keeping the old one would read as
        // though the override were still in force.
        payoutWindowNote: window === 'SCHEDULE' ? null : (note ?? null),
        payoutWindowSetAt: window === 'SCHEDULE' ? null : new Date(),
      },
    });

    await writeAuditLog({
      action: AUDIT_ACTIONS.PAYOUT_WINDOW_SET,
      entityType: 'AnalystProfile',
      entityId: profile.id,
      summary: `გატანის ფანჯარა (${profile.displayName}): ${profile.payoutWindow} → ${window}`,
      actorId: admin.userId,
      actorRole: 'ADMIN',
      metadata: { from: profile.payoutWindow, to: window, note: note ?? null },
    });

    revalidatePath('/admin', 'layout');
    revalidatePath('/analyst/earnings');
    return ok({ window });
  } catch (error) {
    return toActionFailure(error);
  }
}
