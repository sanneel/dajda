'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/authorization';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import {
  openCancellationTest,
  stopTestCalendar,
  type CancellationTest,
} from '@/lib/subscriptions/live-test';

/**
 * The live cancellation test, driven from the admin panel.
 *
 * It existed first as a script, which assumed a terminal, a checkout of the
 * repository and the merchant keys on the operator's own machine. The person
 * who needs the answer has the admin panel and a card. So it lives here, and
 * the keys stay on the server where they already are.
 */

const PAGE = '/admin/payments/subscription-test';

export async function openSubscriptionTestAction(
  _previous: ActionResult<CancellationTest> | null,
  formData: FormData,
): Promise<ActionResult<CancellationTest>> {
  try {
    const admin = await requireAdmin();

    const days = Number(formData.get('startInDays'));
    if (!Number.isFinite(days)) return fail(ERROR_CODES.VALIDATION_ERROR);

    const test = await openCancellationTest(
      { userId: admin.userId },
      { startInDays: days },
    );

    revalidatePath(PAGE);
    return ok(test);
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function stopSubscriptionTestAction(
  _previous: ActionResult<{ accepted: boolean; detail: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ accepted: boolean; detail: string }>> {
  try {
    const admin = await requireAdmin();

    const orderId = formData.get('orderId');
    if (typeof orderId !== 'string' || !orderId) {
      return fail(ERROR_CODES.VALIDATION_ERROR);
    }

    const result = await stopTestCalendar({ userId: admin.userId }, orderId);

    revalidatePath(PAGE);
    return ok(result);
  } catch (error) {
    return toActionFailure(error);
  }
}
