import type { Prisma } from '@/generated/prisma/client';
import type { BalanceEntryKind } from '@/generated/prisma/enums';

/**
 * Writes to the earnings side of the ledger.
 *
 * Every movement is one signed row plus the matching update to the cached
 * total, in the caller's transaction, so the cache and the ledger cannot
 * disagree. The functions here do not open transactions and do not swallow
 * unique violations: idempotency is the caller's decision, because only the
 * caller knows whether a repeat is a webhook redelivery to ignore or a bug.
 *
 * `User.earningsMinor` is deliberately separate from `User.balanceMinor`. A
 * card top-up lands in the spending balance and cannot be withdrawn; only a
 * subscriber's verified payment credits earnings. That keeps "money can leave
 * to a card" limited to money the platform actually received on the analyst's
 * behalf, which is a structural property here rather than a rule someone has
 * to remember.
 */

export type EarningsMovement = {
  userId: string;
  kind: BalanceEntryKind;
  /** Signed: positive credits earnings, negative debits them. Never zero. */
  amountMinor: number;
  currency: string;
  paymentId?: string | null;
  payoutId?: string | null;
  note?: string;
};

/**
 * Apply one earnings movement.
 *
 * The total may go negative, and that is intended: a chargeback arriving after
 * the analyst has withdrawn the month leaves a debt that the next period's
 * earnings absorb.
 */
export async function applyEarningsMovement(
  tx: Prisma.TransactionClient,
  movement: EarningsMovement,
): Promise<{ earningsAfterMinor: number }> {
  const user = await tx.user.update({
    where: { id: movement.userId },
    data: { earningsMinor: { increment: movement.amountMinor } },
    select: { earningsMinor: true },
  });

  await tx.balanceTransaction.create({
    data: {
      userId: movement.userId,
      kind: movement.kind,
      account: 'EARNINGS',
      amountMinor: movement.amountMinor,
      currency: movement.currency,
      balanceAfterMinor: user.earningsMinor,
      paymentId: movement.paymentId ?? null,
      payoutId: movement.payoutId ?? null,
      note: movement.note ?? null,
    },
  });

  return { earningsAfterMinor: user.earningsMinor };
}

/**
 * The analyst's cut of a subscriber's payment.
 *
 * Rounded DOWN. The platform never owes out more than it took in, and the
 * remainder of a division that does not come out evenly stays with the
 * platform rather than being conjured into an extra tetri.
 */
export function analystShareMinor(
  amountMinor: number,
  sharePercent: number,
): number {
  if (amountMinor <= 0) return 0;
  const clamped = Math.min(100, Math.max(0, sharePercent));
  return Math.floor((amountMinor * clamped) / 100);
}
