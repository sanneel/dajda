import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import { getEnv } from '@/lib/env';
import { formatDateKa, formatDateTimeKa, formatMoney } from '@/lib/format';
import { BALANCE_KIND_KA, PAYOUT_STATUS_KA } from '@/lib/labels';
import {
  isWithdrawalWindowOpen,
  nextWithdrawalWindow,
  payoutPeriod,
} from '@/lib/payouts/rules';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { WithdrawForm } from './withdraw-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ანაზღაურება',
  robots: { index: false, follow: false },
};

/**
 * What the analyst has earned and how to take it out.
 *
 * The page states the two rules that decide whether the button works before
 * the analyst presses it: the window is the last day of the month, and the
 * platform checks that the month's content was actually delivered. Finding
 * either of those out from an error message would be a worse experience than
 * reading them here.
 */
export default async function AnalystEarningsPage() {
  const analyst = await requireApprovedAnalyst();
  const env = getEnv();
  const now = new Date();
  const period = payoutPeriod(now);

  const [user, entries, payouts, publications] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: analyst.userId },
      select: { earningsMinor: true },
    }),
    prisma.balanceTransaction.findMany({
      where: { userId: analyst.userId, account: 'EARNINGS' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        amountMinor: true,
        currency: true,
        note: true,
        createdAt: true,
      },
    }),
    prisma.analystPayout.findMany({
      where: { userId: analyst.userId },
      orderBy: { requestedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        status: true,
        maskedCard: true,
        failureReason: true,
        requestedAt: true,
      },
    }),
    prisma.prediction.count({
      where: {
        authorId: analyst.analystProfileId,
        publishedAt: { gte: period.start, lt: period.end },
      },
    }),
  ]);

  const windowOpen = isWithdrawalWindowOpen(now);
  const activityMet = publications >= env.ANALYST_MIN_PUBLICATIONS;
  const hasPending = payouts.some(
    (payout) => payout.status === 'REQUESTED' || payout.status === 'APPROVED',
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          ანაზღაურება
        </h1>
        <p className="mt-1.5 text-ink-muted">
          გამომწერების გადახდებიდან კუთვნილი წილი. აქ ნაჩვენები თანხა შევსებულ
          ბალანსს არ ერევა: გატანა შესაძლებელია მხოლოდ ნამუშევარი თანხისა.
        </p>
      </header>

      <Card as="section">
        <CardHeader title="ნაშთი" level={2} />
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="font-display text-3xl text-ink tabular">
              {formatMoney(user.earningsMinor, 'GEL')}
            </p>
            <div className="text-right text-sm">
              <p className="text-ink-muted">
                ამ თვის პუბლიკაციები:{' '}
                <span className="tabular text-ink">{publications}</span> /{' '}
                <span className="tabular">{env.ANALYST_MIN_PUBLICATIONS}</span>
              </p>
              <p className="mt-0.5 text-ink-faint">
                {windowOpen
                  ? 'გატანა დღეს ხელმისაწვდომია.'
                  : `შემდეგი გატანა: ${formatDateKa(nextWithdrawalWindow(now))}`}
              </p>
            </div>
          </div>

          {!activityMet ? (
            <div className="mt-4">
              <Alert tone="warning" title="აქტივობის შემოწმება">
                ამ თვეში {env.ANALYST_MIN_PUBLICATIONS} პუბლიკაციაზე ნაკლები
                გაქვთ. მოთხოვნის შეტანა მაინც შეგიძლიათ, თუმცა მას ცალკე
                განიხილავს ადმინისტრაცია, რადგან გამომწერს მიწოდებული უნდა
                ჰქონდეს ის, რაშიც გადაიხადა.
              </Alert>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="თანხის გატანა"
          level={2}
          description="მოთხოვნის შეტანისთანავე თანხა გამოაკლდება ნაშთს, რომ ერთი და იგივე თანხა ორჯერ არ მოითხოვოთ."
        />
        <CardBody>
          {hasPending ? (
            <Alert tone="info" title="მოთხოვნა უკვე გაქვთ">
              წინა მოთხოვნის დამუშავებამდე ახლის შეტანა შეუძლებელია.
            </Alert>
          ) : (
            <WithdrawForm
              windowOpen={windowOpen}
              minGel={env.ANALYST_MIN_PAYOUT_MINOR / 100}
              maxGel={user.earningsMinor / 100}
            />
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader title="გატანის ისტორია" level={2} />
        <CardBody>
          {payouts.length === 0 ? (
            <EmptyState title="გატანა ჯერ არ მოგითხოვიათ" />
          ) : (
            <ul className="divide-y divide-line">
              {payouts.map((payout) => (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular text-ink">
                      {formatMoney(payout.amountMinor, payout.currency)}
                    </p>
                    <p className="tabular mt-0.5 text-sm text-ink-faint">
                      {payout.maskedCard} · {formatDateTimeKa(payout.requestedAt)}
                    </p>
                    {payout.failureReason ? (
                      <p className="mt-0.5 text-sm text-loss">
                        {payout.failureReason}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    tone={
                      payout.status === 'PAID'
                        ? 'accent'
                        : payout.status === 'REJECTED' ||
                            payout.status === 'FAILED'
                          ? 'loss'
                          : 'pending'
                    }
                  >
                    {PAYOUT_STATUS_KA[payout.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader title="დარიცხვები" level={2} />
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState title="დარიცხვა ჯერ არ დაფიქსირებულა" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 text-ink-muted">
                    {BALANCE_KIND_KA[entry.kind]}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-ink-faint">
                      {formatDateKa(entry.createdAt)}
                    </span>
                    <span className="tabular text-ink">
                      {entry.amountMinor > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(entry.amountMinor), entry.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
