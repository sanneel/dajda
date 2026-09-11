import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { applyEarningsMovement } from '@/lib/balance/ledger';
import { formatMoney } from '@/lib/format';
import { deriveCardKey, openCard, sealCard } from './card-vault';
import {
  checkWithdrawal,
  maskIban,
  monthlyActivity,
  normaliseIban,
  payoutPeriod,
  WITHDRAWAL_REFUSAL_KA,
} from './rules';

/**
 * Withdrawals.
 *
 * Two deliberate properties:
 *
 *   1. The earnings leave the analyst's balance when the request is MADE, not
 *      when it is paid. Otherwise the same money could be requested again
 *      while an administrator is looking at the first request, and only the
 *      second transfer would reveal it.
 *   2. Money never leaves without a person moving it. The payment contract
 *      covers taking payments, not sending them, and settles every payment to
 *      the merchant bank account within a day. So the analyst asks, the
 *      administrators are told on Telegram, one of them transfers the amount
 *      from that bank account, and then marks the request paid here. A refusal
 *      puts the earnings straight back.
 *
 * The IBAN is typed once, by the analyst. It travels sealed (see ./card-vault)
 * to the one page where an administrator has to read it to make the transfer,
 * and is wiped from the row the moment the request is decided, whichever way.
 * What stays for good is the mask.
 */

/** The key the open requests' account numbers are sealed under right now. */
function payoutCardKey(): Buffer {
  const env = getEnv();
  return deriveCardKey(env.PAYOUT_CARD_KEY ?? env.AUTH_SECRET);
}

export type WithdrawalRequest = {
  amountMinor: number;
  iban: string;
};

export async function requestWithdrawal(
  input: WithdrawalRequest,
  actor: { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
): Promise<{ payoutId: string; activityCheckPassed: boolean }> {
  const env = getEnv();
  const now = new Date();

  const profile = await prisma.analystProfile.findUnique({
    where: { userId: actor.userId },
    select: {
      id: true,
      status: true,
      displayName: true,
      // An administrator may have opened the window for this author early,
      // or held it shut. Read with the profile, applied by the rules.
      payoutWindow: true,
      // The author's own promise for a month (agreement 3.5), which is what
      // the month is judged against.
      monthlyMinimum: true,
    },
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
    iban: input.iban,
    hasPendingRequest: pending > 0,
    override: profile.payoutWindow,
  });

  if (!verdict.allowed) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      WITHDRAWAL_REFUSAL_KA[verdict.reason],
    );
  }

  // What the platform saw of this month, recorded at request time so the
  // administrator judges the same figures the analyst was judged on. The
  // dates are read rather than counted, because an empty week is a breach.
  const period = payoutPeriod(now);
  const published = await prisma.prediction.findMany({
    where: {
      authorId: profile.id,
      publishedAt: { gte: period.start, lt: period.end },
    },
    select: { publishedAt: true },
  });
  const activity = monthlyActivity({
    period,
    publishedAt: published
      .map((row) => row.publishedAt)
      .filter((value): value is Date => value !== null),
    declaredMinimum: profile.monthlyMinimum,
  });

  const maskedAccount = maskIban(input.iban);
  const accountCipher = sealCard(normaliseIban(input.iban), payoutCardKey());

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
        maskedAccount,
        accountCipher,
        providerOrderId: `dajda-payout-${randomUUID()}`,
        periodStart: period.start,
        periodEnd: period.end,
        publicationsInPeriod: activity.total,
        weeksInPeriod: activity.weeks,
        weeksMeetingMinimum: activity.weeks - activity.emptyWeeks,
        activityCheckPassed: activity.passed,
        declaredMonthlyMinimum: activity.declaredMinimum,
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
        note: `გატანის მოთხოვნა: ${maskedAccount}`,
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
          declaredMinimum: activity.declaredMinimum,
          perWeek: activity.perWeek,
          emptyWeeks: activity.emptyWeeks,
          weeks: activity.weeks,
          activityCheckPassed: activity.passed,
          maskedAccount,
        },
      },
      tx,
    );

    return { payoutId: payout.id, activityCheckPassed: activity.passed };
  });
}

/** Put held earnings back, for a refusal. */
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
 * The full IBAN of an open request, for the administrator who is about to
 * transfer the money. Null when the row no longer carries a sealed account,
 * or carries one sealed under a key that has since been rotated.
 */
export function revealPayoutIban(accountCipher: string | null): string | null {
  return accountCipher ? openCard(accountCipher, payoutCardKey()) : null;
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
  // sealed account has no reader left, so it goes with the decision.
  const claimed = await prisma.analystPayout.updateMany({
    where: { id: payout.id, status: 'REQUESTED' },
    data: {
      status: 'REJECTED',
      accountCipher: null,
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
 * Record that an administrator has transferred the money.
 *
 * The transfer itself happens in the bank, not here. This is the statement
 * that it did, with the bank's reference when there is one, and it is what
 * closes the request. Nothing moves in the ledger: the earnings were held out
 * of the balance when the request was made. The sealed IBAN is wiped, because
 * nobody needs to read it again.
 */
export async function markPayoutPaid(
  payoutId: string,
  admin: { userId: string },
  paymentReference?: string,
): Promise<void> {
  const payout = await prisma.analystPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      status: true,
      maskedAccount: true,
    },
  });
  if (!payout) throw new AppError(ERROR_CODES.NOT_FOUND);
  if (payout.status !== 'REQUESTED') {
    throw new AppError(ERROR_CODES.CONFLICT, 'მოთხოვნა უკვე დამუშავებულია.');
  }

  // Guarded by status so a double click records one transfer, not two.
  const claimed = await prisma.analystPayout.updateMany({
    where: { id: payout.id, status: 'REQUESTED' },
    data: {
      status: 'PAID',
      accountCipher: null,
      providerCode: 'bank_transfer',
      paymentReference: paymentReference || null,
      decidedAt: new Date(),
      decidedById: admin.userId,
    },
  });
  if (claimed.count === 0) {
    throw new AppError(ERROR_CODES.CONFLICT, 'მოთხოვნა უკვე დამუშავებულია.');
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.PAYOUT_SENT,
    entityType: 'AnalystPayout',
    entityId: payout.id,
    summary: `გატანა გადარიცხულია: ${formatMoney(payout.amountMinor, payout.currency)}, ${payout.maskedAccount}`,
    actorId: admin.userId,
    actorRole: 'ADMIN',
    metadata: { paymentReference: paymentReference || null },
  });
}
