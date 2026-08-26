import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateKa, formatDateTimeKa, formatMoney } from '@/lib/format';
import { PAYOUT_STATUS_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { DecidePayoutForm } from './decide-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'გატანები: ადმინი',
  robots: { index: false, follow: false },
};

/**
 * The payout queue.
 *
 * Money never leaves without somebody here pressing a button, so the row shows
 * what the platform saw of the analyst's month: the activity check is advice
 * for that decision, not a gate that already made it.
 */
export default async function AdminPayoutsPage() {
  await requireAdmin();

  const payouts = await prisma.analystPayout.findMany({
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      status: true,
      maskedCard: true,
      periodStart: true,
      periodEnd: true,
      publicationsInPeriod: true,
      activityCheckPassed: true,
      failureReason: true,
      rawStatus: true,
      requestedAt: true,
      decidedAt: true,
      analystProfile: {
        select: { displayName: true, slug: true, firstName: true, lastName: true },
      },
      user: { select: { email: true, earningsMinor: true } },
    },
  });

  const open = payouts.filter((payout) => payout.status === 'REQUESTED');
  const rest = payouts.filter((payout) => payout.status !== 'REQUESTED');

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          გატანები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ანალიტიკოსების მოთხოვნები. მოთხოვნის შეტანისას თანხა უკვე გამოკლებულია
          მათ ნაშთს, ამიტომ უარყოფა თანხას აბრუნებს.
        </p>
      </header>

      <Card>
        <CardHeader
          title={`განსახილველი (${open.length})`}
          description="დადასტურებისთვის შეიყვანეთ ბარათის ნომერი, რომელიც ანალიტიკოსმა მიუთითა."
        />
        <CardBody>
          {open.length === 0 ? (
            <EmptyState title="განსახილველი მოთხოვნა არ არის" />
          ) : (
            <ul className="divide-y divide-line">
              {open.map((payout) => (
                <li key={payout.id} className="space-y-3 py-4 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <Link
                          href={`/analysts/${payout.analystProfile.slug}`}
                          className="hover:text-accent"
                        >
                          {payout.analystProfile.displayName}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {payout.analystProfile.firstName}{' '}
                        {payout.analystProfile.lastName} · {payout.user.email}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        {payout.maskedCard} ·{' '}
                        {formatDateTimeKa(payout.requestedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-lg text-ink">
                        {formatMoney(payout.amountMinor, payout.currency)}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        დარჩენილი ნაშთი:{' '}
                        {formatMoney(payout.user.earningsMinor, 'GEL')}
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      payout.activityCheckPassed
                        ? 'rounded-md border border-line px-3 py-2 text-sm text-ink-muted'
                        : 'rounded-md border border-loss/40 px-3 py-2 text-sm text-ink-muted'
                    }
                  >
                    აქტივობა {formatDateKa(payout.periodStart)} დან{' '}
                    {formatDateKa(payout.periodEnd)} მდე:{' '}
                    <span className="tabular text-ink">
                      {payout.publicationsInPeriod}
                    </span>{' '}
                    პუბლიკაცია.{' '}
                    {payout.activityCheckPassed
                      ? 'შემოწმება გავლილია.'
                      : 'შემოწმება ვერ გაიარა: გადაამოწმეთ, მიიღეს თუ არა გამომწერებმა კონტენტი.'}
                  </div>

                  <DecidePayoutForm
                    payoutId={payout.id}
                    maskedCard={payout.maskedCard}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader title="ისტორია" description="ბოლო გადაწყვეტილებები." />
          <CardBody>
            {rest.length === 0 ? (
              <EmptyState title="ისტორია ცარიელია" />
            ) : (
              <ul className="divide-y divide-line">
                {rest.map((payout) => (
                  <li
                    key={payout.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-ink">
                        {payout.analystProfile.displayName}
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-faint">
                        {payout.maskedCard} ·{' '}
                        {payout.decidedAt
                          ? formatDateTimeKa(payout.decidedAt)
                          : formatDateTimeKa(payout.requestedAt)}
                      </p>
                      {payout.failureReason ? (
                        <p className="mt-0.5 text-sm text-loss">
                          {payout.failureReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-ink">
                        {formatMoney(payout.amountMinor, payout.currency)}
                      </span>
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="info" title="ბარათის ნომერი არსად ინახება">
          მოთხოვნაში შენახულია მხოლოდ დაფარული სახე. დადასტურებისას შეყვანილი
          ნომერი მოწმდება ამ ნიღბის მიხედვით, ერთხელ ეგზავნება პროვაიდერს და არ
          იწერება.
        </Alert>
      </div>
    </div>
  );
}
