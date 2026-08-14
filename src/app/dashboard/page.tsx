import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { listAnalysts } from '@/lib/queries/analysts';
import {
  formatDateKa,
  formatDateTimeKa,
  formatMoney,
  formatOdds,
} from '@/lib/format';
import {
  BILLING_PERIOD_KA,
  PAYMENT_STATUS_KA,
  SUBSCRIPTION_STATUS_KA,
} from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ButtonLink } from '@/components/ui/button';
import { AnalystRow } from '@/components/analyst-list';
import { CancelSubscriptionButton } from './cancel-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'პროფილი',
  robots: { index: false, follow: false },
};

/*
 * The whole account on one page.
 *
 * This used to be four routes - overview, subscriptions, saved analysts and
 * view history - reachable only through a sidebar that existed to navigate the
 * split. The overview was mostly counts that linked to the other three, so
 * every real answer cost two page loads. There is not enough on any of them to
 * justify a route, and a person checking their account wants to see it, not
 * browse it.
 *
 * Settings stays separate: it is a form you go to on purpose, and mixing
 * editable fields into a page you read would invite accidental edits.
 */
export default async function DashboardPage() {
  const actor = await requireUser();

  const [subscriptions, payments, views, savedRows, pendingPayments] =
    await Promise.all([
      prisma.userSubscription.findMany({
        where: { userId: actor.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          startedAt: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          plan: {
            select: {
              nameKa: true,
              priceMinor: true,
              currency: true,
              billingPeriod: true,
              analystProfile: { select: { displayName: true, slug: true } },
            },
          },
        },
      }),
      prisma.payment.findMany({
        where: { userId: actor.userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          providerOrderId: true,
          amountMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          maskedCard: true,
        },
      }),
      prisma.predictionView.findMany({
        where: { userId: actor.userId },
        orderBy: { viewedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          viewedAt: true,
          prediction: {
            select: {
              id: true,
              status: true,
              oddsMilli: true,
              titleKa: true,
              author: { select: { displayName: true, slug: true } },
            },
          },
        },
      }),
      prisma.savedAnalyst.findMany({
        where: { userId: actor.userId },
        select: { analystProfileId: true },
      }),
      // Counted separately rather than derived from `payments` above, which is
      // capped at ten rows and would undercount a long history.
      prisma.payment.count({
        where: {
          userId: actor.userId,
          status: { in: ['CREATED', 'PROCESSING'] },
        },
      }),
    ]);

  // Reuse the public read model so saved analysts show metrics computed by
  // exactly the same code as the public listing.
  const savedIds = new Set(savedRows.map((row) => row.analystProfileId));
  const savedAnalysts =
    savedIds.size === 0
      ? []
      : (await listAnalysts()).filter((analyst) => savedIds.has(analyst.id));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          გამარჯობა, {actor.name}
        </h1>
        <p className="ph mt-1.5">
          [ერთი ხაზი: რას ხედავს მომხმარებელი ამ გვერდზე]
        </p>
      </header>

      {!actor.emailVerifiedAt ? (
        <Alert tone="info" title="ელფოსტა არ არის დადასტურებული">
          დადასტურების სისტემა ჯერ არ არის სრულად ჩართული: ეს არ ზღუდავს
          პლატფორმით სარგებლობას.
        </Alert>
      ) : null}

      {pendingPayments > 0 ? (
        <Alert tone="warning" title="გადახდა მუშავდება">
          გვაქვს <span className="tabular">{pendingPayments}</span>{' '}
          დაუდასტურებელი გადახდა. გამოწერა გააქტიურდება მხოლოდ ბანკიდან
          სერვერული დადასტურების მიღების შემდეგ.
        </Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Subscriptions                                                     */}
      {/* ---------------------------------------------------------------- */}
      <Card as="section">
        <CardHeader title="გამოწერები" level={2} />
        <CardBody>
          {subscriptions.length === 0 ? (
            <EmptyState
              title="აქტიური გამოწერა არ გაქვთ"
              description="გამოწერა ყოველი ავტორის პროფილზეა: აირჩიეთ ავტორი და ნახეთ მისი გეგმები."
              action={
                <ButtonLink href="/analysts">ანალიტიკოსების ნახვა</ButtonLink>
              }
            />
          ) : (
            <ul className="space-y-4">
              {subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="rounded-card border border-line bg-canvas p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {subscription.plan.nameKa}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {subscription.plan.analystProfile ? (
                          <Link
                            href={`/analysts/${subscription.plan.analystProfile.slug}`}
                            className="hover:text-ink"
                          >
                            {subscription.plan.analystProfile.displayName}
                          </Link>
                        ) : (
                          'პლატფორმის გეგმა'
                        )}
                        {' · '}
                        <span className="tabular">
                          {formatMoney(
                            subscription.plan.priceMinor,
                            subscription.plan.currency,
                          )}
                        </span>{' '}
                        / {BILLING_PERIOD_KA[subscription.plan.billingPeriod]}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {subscription.cancelAtPeriodEnd ? (
                        <Badge tone="warn">გაუქმდება პერიოდის ბოლოს</Badge>
                      ) : null}
                      <Badge
                        tone={
                          subscription.status === 'ACTIVE'
                            ? 'accent'
                            : subscription.status === 'PENDING'
                              ? 'pending'
                              : 'neutral'
                        }
                      >
                        {SUBSCRIPTION_STATUS_KA[subscription.status]}
                      </Badge>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-ink-muted">დაიწყო</dt>
                      <dd className="tabular text-ink">
                        {subscription.startedAt
                          ? formatDateKa(subscription.startedAt)
                          : '·'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">
                        {subscription.cancelAtPeriodEnd
                          ? 'წვდომა მთავრდება'
                          : 'შემდეგი განახლება'}
                      </dt>
                      <dd className="tabular text-ink">
                        {subscription.currentPeriodEnd
                          ? formatDateKa(subscription.currentPeriodEnd)
                          : '·'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">გაუქმება</dt>
                      <dd className="text-ink">
                        {subscription.cancelAtPeriodEnd
                          ? 'დაგეგმილია'
                          : 'არ არის'}
                      </dd>
                    </div>
                  </dl>

                  {subscription.status === 'ACTIVE' &&
                  !subscription.cancelAtPeriodEnd ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <CancelSubscriptionButton
                        subscriptionId={subscription.id}
                      />
                      <p className="mt-2 text-xs text-ink-faint">
                        გაუქმების შემდეგ წვდომა რჩება გადახდილი პერიოდის
                        ბოლომდე. თანხა ავტომატურად აღარ ჩამოიჭრება.
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Saved analysts                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Card as="section">
        <CardHeader
          title="შენახული ავტორები"
          level={2}
          action={
            <Link
              href="/analysts"
              className="text-sm text-accent hover:underline"
            >
              ყველა ავტორი
            </Link>
          }
        />
        <CardBody>
          {savedAnalysts.length === 0 ? (
            <EmptyState
              title="ჯერ არავინ შეგინახავთ"
              description="ავტორის პროფილზე დააჭირეთ „შენახვას“, რომ აქ გამოჩნდეს."
            />
          ) : (
            <ul className="-m-4 divide-y divide-line sm:-m-5">
              {savedAnalysts.map((analyst) => (
                <AnalystRow key={analyst.id} analyst={analyst} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Recently viewed                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Card as="section">
        <CardHeader title="ბოლოს ნანახი" level={2} />
        <CardBody>
          {views.length === 0 ? (
            <EmptyState
              title="ჯერ არაფერი გინახავთ"
              action={
                <ButtonLink href="/free">ბილეთების ნახვა</ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/free/${view.prediction.id}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {view.prediction.titleKa}
                    </Link>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {view.prediction.author ? (
                        <Link
                          href={`/analysts/${view.prediction.author.slug}`}
                          className="hover:text-ink"
                        >
                          {view.prediction.author.displayName}
                        </Link>
                      ) : (
                        <span>უფასო ბილეთი</span>
                      )}
                      {' · '}
                      <span className="tabular">
                        {formatOdds(view.prediction.oddsMilli)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={view.prediction.status} />
                    <span className="tabular text-xs text-ink-faint">
                      {formatDateTimeKa(view.viewedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Payments                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card as="section">
        <CardHeader
          title="გადახდების ისტორია"
          level={2}
          description="სტატუსი მოდის გადახდის პროვაიდერის სერვერული დადასტურებიდან."
        />
        <CardBody>
          {payments.length === 0 ? (
            <EmptyState title="გადახდა ჯერ არ დაფიქსირებულა" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">გადახდების ისტორია</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      თარიღი
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      ბარათი
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-medium text-ink-muted"
                    >
                      თანხა
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-medium text-ink-muted"
                    >
                      სტატუსი
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="tabular py-2.5 text-ink-muted">
                        {formatDateTimeKa(payment.createdAt)}
                      </td>
                      <td className="tabular py-2.5 text-ink-muted">
                        {payment.maskedCard ?? '·'}
                      </td>
                      <td className="tabular py-2.5 text-right text-ink">
                        {formatMoney(payment.amountMinor, payment.currency)}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge
                          tone={
                            payment.status === 'SUCCEEDED'
                              ? 'accent'
                              : payment.status === 'FAILED' ||
                                  payment.status === 'DISPUTED'
                                ? 'loss'
                                : 'neutral'
                          }
                        >
                          {PAYMENT_STATUS_KA[payment.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
