'use server';

import { revalidatePath } from 'next/cache';
import { refreshAnalystList } from '@/lib/queries/analysts';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { enqueueForAnalystAudience } from '@/lib/notifications/outbox';
import { formatUnitsSigned } from '@/lib/format';
import { PREDICTION_STATUS_KA } from '@/lib/labels';
import {
  AppError,
  ERROR_CODES,
  fail,
  invalid,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import {
  adminPlanPriceSchema,
  analystDecisionSchema,
  resolveReportSchema,
  settlePredictionSchema,
  userStatusSchema,
} from '@/lib/validation/schemas';
import { settlePrediction } from '@/lib/predictions/service';

/**
 * Administrative actions.
 *
 * Every export begins with requireAdmin(), which resolves the caller from the
 * session cookie server-side. A non-admin reaching one of these gets FORBIDDEN
 * regardless of what the client sent.
 */

// ---------------------------------------------------------------------------
// Analyst moderation
// ---------------------------------------------------------------------------

export async function decideAnalystAction(
  _previous: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const admin = await requireAdmin();

    const parsed = analystDecisionSchema.safeParse({
      analystProfileId: formData.get('analystProfileId'),
      decision: formData.get('decision'),
      reason: formData.get('reason') || undefined,
    });
    if (!parsed.success) {
      return invalid(parsed.error);
    }

    const { analystProfileId, decision, reason } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const profile = await tx.analystProfile.findUnique({
        where: { id: analystProfileId },
        select: { id: true, displayName: true, userId: true },
      });
      if (!profile) throw new AppError(ERROR_CODES.NOT_FOUND);

      await tx.analystProfile.update({
        where: { id: profile.id },
        data: {
          status: decision,
          approvedAt: decision === 'APPROVED' ? new Date() : null,
          approvedById: decision === 'APPROVED' ? admin.userId : null,
          rejectionReason: decision === 'APPROVED' ? null : (reason ?? null),
        },
      });

      // Approval also grants the ANALYST role, so publishing becomes possible.
      if (decision === 'APPROVED') {
        await tx.user.updateMany({
          where: { id: profile.userId, role: 'USER' },
          data: { role: 'ANALYST' },
        });
      }

      await writeAuditLog(
        {
          action:
            decision === 'APPROVED'
              ? AUDIT_ACTIONS.ANALYST_APPROVED
              : decision === 'REJECTED'
                ? AUDIT_ACTIONS.ANALYST_REJECTED
                : AUDIT_ACTIONS.ANALYST_SUSPENDED,
          entityType: 'AnalystProfile',
          entityId: profile.id,
          summary: `ანალიტიკოსი ${profile.displayName}: ${decision}`,
          actorId: admin.userId,
          actorRole: 'ADMIN',
          metadata: reason ? { reason } : undefined,
        },
        tx,
      );
    });

    revalidatePath('/admin', 'layout');
    revalidatePath('/');
    revalidatePath('/analysts', 'layout');
    refreshAnalystList();
    return ok({ status: decision });
  } catch (error) {
    return toActionFailure(error);
  }
}

// ---------------------------------------------------------------------------
// User moderation
// ---------------------------------------------------------------------------

export async function setUserStatusAction(
  _previous: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const admin = await requireAdmin();

    const parsed = userStatusSchema.safeParse({
      userId: formData.get('userId'),
      status: formData.get('status'),
      reason: formData.get('reason') || undefined,
    });
    if (!parsed.success) return fail(ERROR_CODES.VALIDATION_ERROR);

    const { userId, status, reason } = parsed.data;

    // An admin must not be able to lock themselves out.
    if (userId === admin.userId) {
      return fail(
        ERROR_CODES.CONFLICT,
        'საკუთარი ანგარიშის სტატუსს ვერ შეცვლით.',
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new AppError(ERROR_CODES.NOT_FOUND);

    // Privilege-escalation guard: admins are not suspendable through the UI.
    if (target.role === 'ADMIN') {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'ადმინისტრატორის სტატუსის შეცვლა ინტერფეისიდან შეუძლებელია.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });

      await writeAuditLog(
        {
          action:
            status === 'SUSPENDED'
              ? AUDIT_ACTIONS.USER_SUSPENDED
              : AUDIT_ACTIONS.USER_REINSTATED,
          entityType: 'User',
          entityId: userId,
          summary: `მომხმარებელი ${target.email}: ${status}`,
          actorId: admin.userId,
          actorRole: 'ADMIN',
          metadata: reason ? { reason } : undefined,
        },
        tx,
      );
    });

    // Suspension must take effect immediately, not at next session expiry.
    if (status === 'SUSPENDED') await revokeAllSessionsForUser(userId);

    revalidatePath('/admin', 'layout');
    return ok({ status });
  } catch (error) {
    return toActionFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------

/**
 * Override one author's subscription price.
 *
 * Clause 9.1 gives an AUTHOR three prices to choose between. An
 * administrator is not choosing on their behalf: this exists so a live
 * payment can be put through the real gateway for a lari instead of thirty,
 * which is the only way to see a charge arrive - and, with renewals on, to
 * see the subscription appear on the gateway's recurring page.
 *
 * It reprices an existing plan and never creates one. Opening a plan is also
 * where an author declares the monthly minimum they are held to (clause
 * 6.4), and an administrator inventing that declaration would put a promise
 * in the author's name that the author never made.
 *
 * The same form can put the plan on a DAILY period, so a renewal can be
 * watched arriving the next day instead of the next month. Subscriptions
 * bought while it is daily keep their daily calendar at the gateway even if
 * the plan is set back to monthly; they have to be canceled.
 *
 * A reason is required and the whole thing is audited: a price below the
 * published tiers is a departure from what the site tells buyers, so it has
 * to be answerable afterwards.
 */
export async function setAnalystPlanPriceAction(
  _previous: ActionResult<{
    priceMinor: number;
    billingPeriod: 'MONTHLY' | 'DAILY';
  }> | null,
  formData: FormData,
): Promise<
  ActionResult<{ priceMinor: number; billingPeriod: 'MONTHLY' | 'DAILY' }>
> {
  try {
    const admin = await requireAdmin();

    const parsed = adminPlanPriceSchema.safeParse({
      analystProfileId: formData.get('analystProfileId'),
      priceGel: formData.get('priceGel'),
      billingPeriod: formData.get('billingPeriod') ?? undefined,
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return invalid(parsed.error);
    }

    const {
      analystProfileId,
      priceGel: priceMinor,
      billingPeriod,
      reason,
    } = parsed.data;

    const profile = await prisma.analystProfile.findUnique({
      where: { id: analystProfileId },
      select: { id: true, displayName: true, slug: true },
    });
    if (!profile) throw new AppError(ERROR_CODES.NOT_FOUND);

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { analystProfileId, tier: 'PREMIUM' },
      select: {
        id: true,
        priceMinor: true,
        billingPeriod: true,
        isActive: true,
      },
    });
    if (!plan || !plan.isActive) {
      return fail(
        ERROR_CODES.CONFLICT,
        'ავტორს გამოწერა გააქტიურებული არ აქვს. ფასს ჯერ თავად ავტორი აყენებს.',
      );
    }

    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { priceMinor, billingPeriod },
    });

    await writeAuditLog({
      action: AUDIT_ACTIONS.PLAN_REPRICED,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      summary: `ადმინმა შეცვალა ფასი: ${profile.displayName} ${plan.priceMinor / 100} ლარი/${plan.billingPeriod} -> ${priceMinor / 100} ლარი/${billingPeriod} (${reason})`,
      actorId: admin.userId,
      actorRole: 'ADMIN',
      metadata: {
        from: plan.priceMinor,
        to: priceMinor,
        periodFrom: plan.billingPeriod,
        periodTo: billingPeriod,
        reason,
      },
    });

    // Every surface that prints the price reads the plan row.
    revalidatePath('/admin/analysts');
    revalidatePath('/');
    revalidatePath('/analysts');
    revalidatePath(`/analysts/${profile.slug}`);
    refreshAnalystList();

    return ok({ priceMinor, billingPeriod });
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function settlePredictionAction(
  _previous: ActionResult<{ settled: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ settled: true }>> {
  try {
    const admin = await requireAdmin();

    const parsed = settlePredictionSchema.safeParse({
      predictionId: formData.get('predictionId'),
      outcome: formData.get('outcome'),
      note: formData.get('note') || undefined,
    });

    if (!parsed.success) {
      return invalid(parsed.error);
    }

    const settled = await settlePrediction(parsed.data, {
      userId: admin.userId,
      role: 'ADMIN',
    });

    /*
     * Tell the author's audience how it ended - losses included, because the
     * platform's whole claim is that the record is honest. After the commit,
     * and failure only logs: a settled bet must stay settled even when the
     * outbox misbehaves, and the cron sweep retries what got queued.
     */
    try {
      // Community free tickets have no analyst author and no audience.
      const author = settled.authorId
        ? await prisma.analystProfile.findUnique({
            where: { id: settled.authorId },
            select: { id: true, displayName: true, slug: true },
          })
        : null;
      if (author) {
        const result = await prisma.predictionResult.findUnique({
          where: { predictionId: settled.id },
          select: { profitUnitsCenti: true },
        });
        await enqueueForAnalystAudience(author.id, 'SETTLEMENT', {
          subjectKa: `შედეგი: ${PREDICTION_STATUS_KA[settled.status] ?? settled.status} · ${author.displayName}`,
          bodyKa: `${settled.titleKa}\nერთეულები: ${formatUnitsSigned(result?.profitUnitsCenti ?? 0)}`,
          linkPath: `/analysts/${author.slug}`,
          predictionId: settled.id,
        });
      }
    } catch (error) {
      console.error('[dajda] settlement notification enqueue failed', error);
    }

    revalidatePath('/admin', 'layout');
    revalidatePath('/free');
    refreshAnalystList();
    return ok({ settled: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export async function resolveReportAction(
  _previous: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const admin = await requireAdmin();

    const parsed = resolveReportSchema.safeParse({
      reportId: formData.get('reportId'),
      status: formData.get('status'),
      resolutionNote: formData.get('resolutionNote') || undefined,
    });
    if (!parsed.success) return fail(ERROR_CODES.VALIDATION_ERROR);

    const { reportId, status, resolutionNote } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status,
          resolvedById: status === 'REVIEWING' ? null : admin.userId,
          resolvedAt: status === 'REVIEWING' ? null : new Date(),
          resolutionNote: resolutionNote ?? null,
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.REPORT_RESOLVED,
          entityType: 'Report',
          entityId: reportId,
          summary: `საჩივრის სტატუსი: ${status}`,
          actorId: admin.userId,
          actorRole: 'ADMIN',
        },
        tx,
      );
    });

    revalidatePath('/admin', 'layout');
    return ok({ status });
  } catch (error) {
    return toActionFailure(error);
  }
}
