import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { applyEarningsMovement } from '@/lib/balance/ledger';
import { formatMoney } from '@/lib/format';
import { getPaymentProvider } from '@/lib/payments';
import { deriveCardKey, openCard, sealCard } from './card-vault';
import {
  checkWithdrawal,
  maskCardNumber,
  normaliseCardNumber,
  payoutPeriod,
  weeklyActivity,
  WITHDRAWAL_REFUSAL_KA,
} from './rules';

/**
 * Withdrawals.
 *
 * Two deliberate properties:
 *
 *   1. The earnings leave the analyst's balance when the request is MADE, not
 *      when it is approved. Otherwise the same money could be requested again
 *      while an administrator is looking at the first request, and only the
 *      second failure would reveal it.
 *   2. Money never leaves without a person releasing it. The analyst asks, the
 *      platform records what it saw of their month, and an administrator
 *      approves or refuses. A refusal or a provider failure puts the earnings
 *      straight back.
 *
 * The card number is typed once, by the analyst. It travels to the
 * administrator's approval sealed (see ./card-vault) and is wiped from the
 * row the moment the request is decided, whichever way. What stays for good
 * is the mask.
 */

/** The key the open requests' card numbers are sealed under right now. */
function payoutCardKey(): Buffer {
  const env = getEnv();
  return deriveCardKey(env.PAYOUT_CARD_KEY ?? env.AUTH_SECRET);
}

export type WithdrawalRequest = {
  amountMinor: number;
  cardNumber: string;
};

export async function requestWithdrawal(
  input: WithdrawalRequest,
  actor: { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
): Promise<{ payoutId: string; activityCheckPassed: boolean }> {
  const env = getEnv();
  const now = new Date();

  const profile = await prisma.analystProfile.findUnique({
    where: { userId: actor.userId },
    select: { id: true, status: true, displayName: true },
  });
  if (!profile || profile.status !== 'APPROVED') {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'გატანა მხოლოდ დამოწმებულ ანალიტიკოსს შეუძლია.');
  }

  const [user, pending] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { earningsMinor: true },
    }),
    prisma.analystPayout.count({
      where: { userId: actor.userId, status: { in: ['REQUESTED', 'APPROVED'] } },
    }),
  ]);

  const verdict = checkWithdrawal({
    now,
    amountMinor: input.amountMinor,
    earningsMinor: user.earningsMinor,
    minimumMinor: env.ANALYST_MIN_PAYOUT_MINOR,
    cardNumber: input.cardNumber,
    hasPendingRequest: pending > 0,
  });

  if (!verdict.allowed) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      WITHDRAWAL_REFUSAL_KA[verdict.reason],
    );
  }

  // What the platform saw of this month, recorded at request time so the
  // administrator judges the same figures the analyst was judged on. The
  // dates are read rather than counted, because the check is per week.
  const period = payoutPeriod(now);
  const published = await prisma.prediction.findMany({
    where: {
      authorId: profile.id,
      publishedAt: { gte: period.start, lt: period.end },
    },
    select: { publishedAt: true },
  });
  const activity = weeklyActivity({
    period,
    publishedAt: published
      .map((row) => row.publishedAt)
      .filter((value): value is Date => value !== null),
    minimumPerWeek: env.ANALYST_MIN_PUBLICATIONS_PER_WEEK,
  });

  const maskedCard = maskCardNumber(input.cardNumber);
  const cardCipher = sealCard(
    normaliseCardNumber(input.cardNumber),
    payoutCardKey(),
  );

  return prisma.$transaction(async (tx) => {
    // Conditional decrement, so two requests racing cannot both take the
    // same earnings.
    const held = await tx.user.updateMany({
      where: { id: actor.userId, earningsMinor: { gte: input.amountMinor } },
      data: { earningsMinor: { decrement: input.amountMinor } },
    });
    if (held.count === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        WITHDRAWAL_REFUSAL_KA.INSUFFICIENT_EARNINGS,
      );
    }

    const payout = await tx.analystPayout.create({
      data: {
        analystProfileId: profile.id,
        userId: actor.userId,
        amountMinor: input.amountMinor,
        currency: 'GEL',
        status: 'REQUESTED',
        maskedCard,
        cardCipher,
        providerOrderId: `dajda-payout-${randomUUID()}`,
        periodStart: period.start,
        periodEnd: period.end,
        publicationsInPeriod: activity.total,
        weeksInPeriod: activity.weeks,
        weeksMeetingMinimum: activity.weeksMet,
        activityCheckPassed: activity.passed,
      },
      select: { id: true },
    });

    const after = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { earningsMinor: true },
    });

    await tx.balanceTransaction.create({
      data: {
        userId: actor.userId,
        kind: 'WITHDRAWAL',
        account: 'EARNINGS',
        amountMinor: -input.amountMinor,
        currency: 'GEL',
        balanceAfterMinor: after.earningsMinor,
        payoutId: payout.id,
        note: `გატანის მოთხოვნა: ${maskedCard}`,
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PAYOUT_REQUESTED,
        entityType: 'AnalystPayout',
        entityId: payout.id,
        summary: `გატანის მოთხოვნა: ${formatMoney(input.amountMinor, 'GEL')}`,
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: {
          publications: activity.total,
          perWeek: activity.perWeek,
          weeksMet: activity.weeksMet,
          weeks: activity.weeks,
          activityCheckPassed: activity.passed,
          maskedCard,
        },
      },
      tx,
    );

    return { payoutId: payout.id, activityCheckPassed: activity.passed };
  });
}

/** Put held earnings back, for a refusal or a failed provider call. */
async function returnEarnings(
  payoutId: string,
  userId: string,
  amountMinor: number,
  reason: string,
) {
  await prisma.$transaction(async (tx) => {
    await applyEarningsMovement(tx, {
      userId,
      kind: 'WITHDRAWAL_REVERSAL',
      amountMinor,
      currency: 'GEL',
      payoutId,
      note: reason,
    });
  });
}

/**
 * Refuse a request. The earnings go back and the analyst can ask again in the
 * next window.
 */
export async function rejectPayout(
  payoutId: string,
  reason: string,
  admin: { userId: string },
): Promise<void> {
  const payout = await prisma.analystPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, userId: true, amountMinor: true, status: true },
  });
  if (!payout) throw new AppError(ERROR_CODES.NOT_FOUND);
  if (payout.status !== 'REQUESTED') {
    throw new AppError(ERROR_CODES.CONFLICT, 'მოთხოვნა უკვე დამუშავებულია.');
  }

  // Guarded by status so a double click decides once. Decided means the
  // sealed card number has no reader left, so it goes with the decision.
  const claimed = await prisma.analystPayout.updateMany({
    where: { id: payout.id, status: 'REQUESTED' },
    data: {
      status: 'REJECTED',
      cardCipher: null,
      failureReason: reason,
      decidedAt: new Date(),
      decidedById: admin.userId,
    },
  });
  if (claimed.count === 0) return;

  await returnEarnings(
    payout.id,
    payout.userId,
    payout.amountMinor,
    `გატანა უარყოფილია: ${reason}`,
  );

  await writeAuditLog({
    action: AUDIT_ACTIONS.PAYOUT_REJECTED,
    entityType: 'AnalystPayout',
    entityId: payout.id,
    summary: `გატანა უარყოფილია: ${reason}`,
    actorId: admin.userId,
    actorRole: 'ADMIN',
  });
}

/**
 * Release a request to the provider.
 *
 * The card number comes from the sealed copy the analyst's request carries.
 * An administrator may still type one - it is the only way to release a
 * request made before sealing existed, or one sealed under a key that has
 * since been rotated - and anything typed is checked against the mask taken
 * at request time, so an approval cannot quietly redirect the money to a
 * different card.
 */
export async function approvePayout(
  payoutId: string,
  admin: { userId: string },
  typedCardNumber?: string,
): Promise<{ status: 'PAID' | 'APPROVED' | 'FAILED'; message?: string }> {
  const payout = await prisma.analystPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      userId: true,
      amountMinor: true,
      currency: true,
      status: true,
      maskedCard: true,
      cardCipher: true,
      providerOrderId: true,
      analystProfile: { select: { displayName: true } },
    },
  });
  if (!payout) throw new AppError(ERROR_CODES.NOT_FOUND);
  if (payout.status !== 'REQUESTED') {
    throw new AppError(ERROR_CODES.CONFLICT, 'მოთხოვნა უკვე დამუშავებულია.');
  }

  let cardNumber: string | null = null;

  if (typedCardNumber) {
    if (maskCardNumber(typedCardNumber) !== payout.maskedCard) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'ბარათი არ ემთხვევა მოთხოვნაში მითითებულს.',
      );
    }
    cardNumber = normaliseCardNumber(typedCardNumber);
  } else if (payout.cardCipher) {
    cardNumber = openCard(payout.cardCipher, payoutCardKey());
  }

  if (!cardNumber) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'ამ მოთხოვნას ბარათის ნომერი აღარ ახლავს. შეიყვანეთ ნომერი ხელით, ან უარყავით და სთხოვეთ ავტორს მოთხოვნის ხელახლა შეტანა.',
    );
  }

  const provider = getPaymentProvider();

  // Claim it before the network call, so a retry cannot send twice.
  const claimed = await prisma.analystPayout.updateMany({
    where: { id: payout.id, status: 'REQUESTED' },
    data: {
      status: 'APPROVED',
      providerCode: provider.code,
      decidedAt: new Date(),
      decidedById: admin.userId,
    },
  });
  if (claimed.count === 0) {
    throw new AppError(ERROR_CODES.CONFLICT, 'მოთხოვნა უკვე დამუშავებულია.');
  }

  try {
    const result = await provider.createPayout({
      orderId: payout.providerOrderId,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      description: `DAJDA: ანაზღაურება ${payout.analystProfile.displayName}`,
      receiverCardNumber: cardNumber,
    });

    // The provider has the number now; the row does not need it any more.
    await prisma.analystPayout.update({
      where: { id: payout.id },
      data: {
        status: result.status === 'SUCCEEDED' ? 'PAID' : result.status === 'FAILED' ? 'FAILED' : 'APPROVED',
        cardCipher: null,
        providerPayoutId: result.providerPaymentId,
        rawStatus: result.rawStatus,
        failureReason: result.status === 'FAILED' ? (result.message ?? null) : null,
      },
    });

    if (result.status === 'FAILED') {
      await returnEarnings(
        payout.id,
        payout.userId,
        payout.amountMinor,
        `გატანა ვერ შესრულდა: ${result.message ?? result.rawStatus}`,
      );
    }

    await writeAuditLog({
      action: AUDIT_ACTIONS.PAYOUT_SENT,
      entityType: 'AnalystPayout',
      entityId: payout.id,
      summary: `გატანა გაიგზავნა პროვაიდერთან: ${result.status}`,
      actorId: admin.userId,
      actorRole: 'ADMIN',
      metadata: { rawStatus: result.rawStatus },
    });

    return {
      status:
        result.status === 'SUCCEEDED'
          ? 'PAID'
          : result.status === 'FAILED'
            ? 'FAILED'
            : 'APPROVED',
      message: result.message,
    };
  } catch (error) {
    /*
     * The provider call did not complete. It is not safe to assume the credit
     * did not happen, so the request is marked FAILED with the reason and the
     * earnings are returned; a payout that did go through despite the error
     * shows up as a provider-side discrepancy for a human to reconcile, which
     * is the failure mode worth preferring over silently keeping an analyst's
     * money held forever.
     */
    const detail = error instanceof Error ? error.message : String(error);

    await prisma.analystPayout.update({
      where: { id: payout.id },
      data: {
        status: 'FAILED',
        cardCipher: null,
        failureReason: detail.slice(0, 500),
      },
    });
    await returnEarnings(
      payout.id,
      payout.userId,
      payout.amountMinor,
      'გატანა ვერ შესრულდა ტექნიკური შეცდომით',
    );

    await writeAuditLog({
      action: AUDIT_ACTIONS.PAYOUT_FAILED,
      entityType: 'AnalystPayout',
      entityId: payout.id,
      summary: 'გატანა ვერ შესრულდა',
      actorId: admin.userId,
      actorRole: 'ADMIN',
      metadata: { detail },
    });

    return { status: 'FAILED', message: detail };
  }
}
