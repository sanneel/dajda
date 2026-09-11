import { prisma } from '@/lib/db';

/** Said wherever posting a subscription ticket is refused. */
export const SUBSCRIPTION_TICKET_NEEDS_PLAN_KA =
  'გამოწერით ხელმისაწვდომი ბილეთის დადება შესაძლებელია გამოწერის გააქტიურების შემდეგ.';

/**
 * Does this author have a subscription anybody can buy?
 *
 * A subscription ticket opens only for subscribers, so before an active,
 * priced plan exists it would be a ticket nobody but its author could ever
 * open. The post form asks this to offer the option, and the write path asks
 * it again, so a hand-built request cannot post one either.
 */
export async function hasSubscriptionForSale(
  analystProfileId: string,
): Promise<boolean> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: {
      analystProfileId,
      tier: 'PREMIUM',
      isActive: true,
      priceMinor: { gt: 0 },
    },
    select: { id: true },
  });
  return plan !== null;
}
