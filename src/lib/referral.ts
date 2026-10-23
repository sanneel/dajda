import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { REFERRAL_COOKIE, parseReferralCode } from '@/lib/referral-cookie';

/**
 * The approved analyst behind this browser's referral cookie, or null.
 *
 * Read at the moment an account is created. A pending, rejected or suspended
 * author earns no referrals, and neither does a slug that no longer exists.
 */
export async function referrerFromCookie(): Promise<string | null> {
  const jar = await cookies();
  const code = parseReferralCode(jar.get(REFERRAL_COOKIE)?.value);
  if (!code) return null;
  const analyst = await prisma.analystProfile.findFirst({
    where: { slug: code, status: 'APPROVED' },
    select: { id: true },
  });
  return analyst?.id ?? null;
}

/** The same check for an id carried in a sign-up link. */
export async function approvedReferrer(
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const analyst = await prisma.analystProfile.findFirst({
    where: { id, status: 'APPROVED' },
    select: { id: true },
  });
  return analyst?.id ?? null;
}

export type ReferralStats = {
  signups: number;
  payers: number;
  revenueMinor: number;
};

/**
 * What the people an analyst brought in have done: how many signed up, how
 * many paid for anything, and the total they paid, to any author. Refunded
 * and disputed charges are left out.
 */
export async function referralStats(
  analystProfileIds: string[],
): Promise<Map<string, ReferralStats>> {
  const stats = new Map<string, ReferralStats>(
    analystProfileIds.map((id) => [id, { signups: 0, payers: 0, revenueMinor: 0 }]),
  );
  if (analystProfileIds.length === 0) return stats;

  const [signups, payments] = await Promise.all([
    prisma.user.groupBy({
      by: ['referredById'],
      where: { referredById: { in: analystProfileIds } },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['userId'],
      where: {
        status: 'SUCCEEDED',
        user: { referredById: { in: analystProfileIds } },
      },
      _sum: { amountMinor: true },
    }),
  ]);

  for (const row of signups) {
    const entry = row.referredById ? stats.get(row.referredById) : undefined;
    if (entry) entry.signups = row._count._all;
  }

  if (payments.length > 0) {
    const owners = await prisma.user.findMany({
      where: { id: { in: payments.map((row) => row.userId) } },
      select: { id: true, referredById: true },
    });
    const referrerOf = new Map(owners.map((user) => [user.id, user.referredById]));
    for (const row of payments) {
      const referrer = referrerOf.get(row.userId);
      const entry = referrer ? stats.get(referrer) : undefined;
      if (!entry) continue;
      entry.payers += 1;
      entry.revenueMinor += row._sum.amountMinor ?? 0;
    }
  }

  return stats;
}
