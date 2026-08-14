'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  AppError,
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { reportSchema } from '@/lib/validation/schemas';

/**
 * File a report against an analyst or a prediction.
 *
 * Server Actions carry Next's built-in Origin/Host check, which is what
 * defends this against CSRF; on top of that the caller is resolved from the
 * session cookie and never from a client-supplied id.
 */
export async function submitReport(
  _previous: ActionResult<{ reportId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reportId: string }>> {
  try {
    const actor = await requireUser();

    const limit = rateLimiter.check(
      `report:${actor.userId}`,
      RATE_LIMITS.report,
    );
    if (!limit.allowed) throw new AppError(ERROR_CODES.RATE_LIMITED);

    const parsed = reportSchema.safeParse({
      targetType: formData.get('targetType'),
      targetId: formData.get('targetId'),
      reason: formData.get('reason'),
      details: formData.get('details') || undefined,
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const input = parsed.data;

    // Confirm the target exists before storing a dangling report.
    if (input.targetType === 'ANALYST') {
      const exists = await prisma.analystProfile.count({
        where: { id: input.targetId },
      });
      if (exists === 0) throw new AppError(ERROR_CODES.NOT_FOUND);
    } else {
      const exists = await prisma.prediction.count({
        where: { id: input.targetId, publishedAt: { not: null } },
      });
      if (exists === 0) throw new AppError(ERROR_CODES.NOT_FOUND);
    }

    const headerList = await headers();

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.report.create({
        data: {
          reporterId: actor.userId,
          targetType: input.targetType,
          analystProfileId:
            input.targetType === 'ANALYST' ? input.targetId : null,
          predictionId:
            input.targetType === 'PREDICTION' ? input.targetId : null,
          reason: input.reason,
          details: input.details ?? null,
        },
        select: { id: true },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.REPORT_FILED,
          entityType: 'Report',
          entityId: created.id,
          summary: `საჩივარი დაფიქსირდა: ${input.reason}`,
          actorId: actor.userId,
          actorRole: actor.role,
          ipAddress: headerList.get('x-forwarded-for'),
          userAgent: headerList.get('user-agent'),
        },
        tx,
      );

      return created;
    });

    revalidatePath('/admin/reports');

    return ok({ reportId: report.id });
  } catch (error) {
    return toActionFailure(error);
  }
}
