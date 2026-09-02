import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateKa, formatDateTimeKa, formatMoney, formatOdds } from '@/lib/format';
import { REPORT_REASON_KA } from '@/lib/labels';
import { decideAnalystAction } from '@/actions/admin';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ActionButton } from '@/components/admin/action-button';
import { SettleForm } from './predictions/settle-form';
import { DecidePayoutForm } from './payouts/decide-form';
import { ReportDecisionForm } from './reports/decide-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'სამუშაო · ადმინი',
  robots: { index: false, follow: false },
};

/** How much of each queue is shown here before "ყველა" takes over. */
const PER_QUEUE = 8;

/**
 * The queue: everything waiting on an administrator, in one place, in the
 * order it costs people money to leave undone.
 *
 * The overview this replaces was a dashboard - eight totals in a stat grid,
 * three alerts that each said "go to another page". None of it could be
 * acted on. Here every row carries its own decision: a bet settles from its
 * row, an application is approved from its row, a payout is released from
 * its row. The four totals live on the nav, where they are read anyway.
 *
 * Bets first, because a settled bet is the product; then applications,
 * because an approved author starts earning; then money; then reports.
 */
export default async function AdminQueuePage() {
  await requireAdmin();

  const [
    bets,
    betsTotal,
    applications,
    applicationsTotal,
    payouts,
    payoutsTotal,
    reports,
    reportsTotal,
    failedWebhooks,
  ] = await Promise.all([
    prisma.prediction.findMany({
      where: { finishedAt: { not: null }, status: 'PENDING', supersededAt: null },
      // Oldest first: the one an author has been waiting on longest.
      orderBy: { finishedAt: 'asc' },
      take: PER_QUEUE,
      select: {
        id: true,
        titleKa: true,
        screenshotPath: true,
        resultScreenshotPath: true,
        oddsMilli: true,
        eventAt: true,
        finishedAt: true,
        sport: { select: { nameKa: true } },
        author: { select: { displayName: true, slug: true } },
      },
    }),
    prisma.prediction.count({
      where: { finishedAt: { not: null }, status: 'PENDING', supersededAt: null },
    }),
    prisma.analystProfile.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: PER_QUEUE,
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        monthlyMinimum: true,
        identityDocumentId: true,
        createdAt: true,
        primarySport: { select: { nameKa: true } },
        user: { select: { email: true } },
      },
    }),
    prisma.analystProfile.count({ where: { status: 'PENDING' } }),
    prisma.analystPayout.findMany({
      where: { status: 'REQUESTED' },
      orderBy: { requestedAt: 'asc' },
      take: PER_QUEUE,
      select: {
        id: true,
        amountMinor: true,
        currency: true,
        maskedCard: true,
        cardCipher: true,
        activityCheckPassed: true,
        weeksInPeriod: true,
        weeksMeetingMinimum: true,
        publicationsInPeriod: true,
        requestedAt: true,
        analystProfile: { select: { displayName: true, slug: true } },
      },
    }),
    prisma.analystPayout.count({ where: { status: 'REQUESTED' } }),
    prisma.report.findMany({
      where: { status: { in: ['OPEN', 'REVIEWING'] } },
      orderBy: { createdAt: 'asc' },
      take: PER_QUEUE,
      select: {
        id: true,
        reason: true,
        status: true,
        details: true,
        createdAt: true,
        reporter: { select: { email: true } },
        analystProfile: { select: { displayName: true, slug: true } },
        prediction: { select: { id: true, titleKa: true } },
      },
    }),
    prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
    prisma.webhookEvent.count({ where: { signatureValid: false } }),
  ]);

  const total = betsTotal + applicationsTotal + payoutsTotal + reportsTotal;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">სამუშაო</h1>
        <p className="mt-1.5 text-ink-muted">
          {total === 0
            ? 'ყველაფერი დამუშავებულია.'
            : `${total} გადასაწყვეტი. თითოეული აქვე წყდება.`}
        </p>
      </header>

      {total > 0 ? (
        <nav aria-label="რიგები" className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {[
              { id: 'bets', label: 'დასათვლელი', count: betsTotal },
              { id: 'applications', label: 'განაცხადები', count: applicationsTotal },
              { id: 'payouts', label: 'გატანები', count: payoutsTotal },
              { id: 'reports', label: 'საჩივრები', count: reportsTotal },
            ].map((queue) => (
              <li key={queue.id}>
                {queue.count > 0 ? (
                  <a
                    href={`#${queue.id}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-line-strong"
                  >
                    {queue.label}
                    <span className="tabular rounded-full bg-ink px-1.5 text-xs text-on-ink">
                      {queue.count}
                    </span>
                  </a>
                ) : (
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-transparent px-3 text-sm text-ink-faint">
                    {queue.label}
                    <span className="tabular text-xs">0</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {failedWebhooks > 0 ? (
        <div className="mb-6">
          <Alert tone="error" title="webhook უარყოფილია ხელმოწერაზე">
            {failedWebhooks} მიღებული callback არასწორი ხელმოწერით არ
            გამოყენებულა.{' '}
            <Link href="/admin/payments" className="underline">
              გადახდების ჟურნალი
            </Link>
          </Alert>
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          title="რიგი ცარიელია"
          description="დასათვლელი ფსონი, განაცხადი, გატანა და საჩივარი ამ წუთას არ არის. ახალი აქვე გამოჩნდება."
        />
      ) : (
        <div className="space-y-9">
          {/* ------------------------------------------------------------- */}
          {/* 1. Bets an author has finished; an admin records the result     */}
          {/* ------------------------------------------------------------- */}
          {betsTotal > 0 ? (
            <Queue
              id="bets"
              title="დასათვლელი"
              count={betsTotal}
              shown={bets.length}
              allHref="/admin/predictions?review=awaiting"
            >
              {bets.map((bet) => (
                <li key={bet.id} className="py-4 first:pt-0 last:pb-0">
                  {/* Stacked on a phone: two thumbnails beside a text column
                      left the title four words wide. */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    {/* The two screenshots the decision is made from. */}
                    <div className="flex shrink-0 gap-2">
                      <Slip
                        href={bet.screenshotPath}
                        src={bet.screenshotPath}
                        label="ფსონი"
                      />
                      {bet.resultScreenshotPath ? (
                        <Slip
                          href={bet.resultScreenshotPath}
                          src={bet.resultScreenshotPath}
                          label="შედეგი"
                        />
                      ) : (
                        <div className="flex h-16 w-24 items-center justify-center rounded-card border border-dashed border-line-strong px-2 text-center text-xs leading-tight text-ink-faint">
                          შედეგის ფოტო არ არის
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/free/${bet.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {bet.titleKa}
                      </Link>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {bet.author ? (
                          <Link
                            href={`/analysts/${bet.author.slug}`}
                            className="hover:text-ink"
                          >
                            {bet.author.displayName}
                          </Link>
                        ) : (
                          'უფასო პროგნოზი'
                        )}
                        {' · '}
                        {bet.sport.nameKa}
                        {' · კოეფ. '}
                        <span className="tabular">{formatOdds(bet.oddsMilli)}</span>
                        {bet.eventAt ? (
                          <>
                            {' · მატჩი '}
                            <span className="tabular">
                              {formatDateTimeKa(bet.eventAt)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-faint">
                        დასრულებულია{' '}
                        {bet.finishedAt ? formatDateTimeKa(bet.finishedAt) : ''}
                      </p>
                      <div className="mt-3">
                        <SettleForm predictionId={bet.id} defaultOpen />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </Queue>
          ) : null}

          {/* ------------------------------------------------------------- */}
          {/* 2. Applications                                                 */}
          {/* ------------------------------------------------------------- */}
          {applicationsTotal > 0 ? (
            <Queue
              id="applications"
              title="განაცხადები"
              count={applicationsTotal}
              shown={applications.length}
              allHref="/admin/analysts"
            >
              {applications.map((profile) => (
                <li key={profile.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start gap-4">
                    <Avatar name={profile.displayName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{profile.displayName}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {[profile.firstName, profile.lastName]
                          .filter(Boolean)
                          .join(' ') || 'სახელი მითითებული არაა'}
                        {' · '}
                        {profile.user.email}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {profile.primarySport?.nameKa ?? 'სპორტი მითითებული არაა'}
                        {profile.monthlyMinimum !== null ? (
                          <>
                            {' · თვეში '}
                            <span className="tabular">{profile.monthlyMinimum}</span>
                            {' პროგნოზი'}
                          </>
                        ) : null}
                        {' · '}
                        {formatDateKa(profile.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href="/admin/analysts"
                        className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink"
                      >
                        სრული განაცხადი
                      </Link>
                      {profile.identityDocumentId ? (
                        <a
                          href={`/admin/identity-documents/${profile.identityDocumentId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                        >
                          პირადობა
                        </a>
                      ) : (
                        <Badge tone="warn">დოკუმენტის გარეშე</Badge>
                      )}
                      <ActionButton
                        action={decideAnalystAction}
                        fields={{ analystProfileId: profile.id, decision: 'APPROVED' }}
                        label="დამოწმება"
                        tone="accent"
                      />
                      <ActionButton
                        action={decideAnalystAction}
                        fields={{ analystProfileId: profile.id, decision: 'REJECTED' }}
                        label="უარყოფა"
                        tone="danger"
                        confirm={`უარვყოთ ${profile.displayName}?`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </Queue>
          ) : null}

          {/* ------------------------------------------------------------- */}
          {/* 3. Money leaving                                                */}
          {/* ------------------------------------------------------------- */}
          {payoutsTotal > 0 ? (
            <Queue
              id="payouts"
              title="გატანები"
              count={payoutsTotal}
              shown={payouts.length}
              allHref="/admin/payouts"
            >
              {payouts.map((payout) => (
                <li key={payout.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <Link
                          href={`/analysts/${payout.analystProfile.slug}`}
                          className="hover:text-accent"
                        >
                          {payout.analystProfile.displayName}
                        </Link>
                        <span className="tabular ml-3 text-ink">
                          {formatMoney(payout.amountMinor, payout.currency)}
                        </span>
                      </p>
                      <p className="tabular mt-0.5 text-sm text-ink-muted">
                        {payout.maskedCard} · {formatDateTimeKa(payout.requestedAt)}
                      </p>
                      <p
                        className={`mt-0.5 text-xs ${
                          payout.activityCheckPassed ? 'text-ink-faint' : 'text-loss'
                        }`}
                      >
                        {payout.activityCheckPassed
                          ? 'აქტივობის შემოწმება გავლილია'
                          : `აქტივობა ვერ გაიარა: ნორმა ${payout.weeksMeetingMinimum} / ${payout.weeksInPeriod} კვირაში`}
                        {' · '}
                        <span className="tabular">{payout.publicationsInPeriod}</span>
                        {' პუბლიკაცია'}
                      </p>
                    </div>
                    <DecidePayoutForm
                      payoutId={payout.id}
                      maskedCard={payout.maskedCard}
                      hasStoredCard={payout.cardCipher !== null}
                      amountLabel={formatMoney(payout.amountMinor, payout.currency)}
                    />
                  </div>
                </li>
              ))}
            </Queue>
          ) : null}

          {/* ------------------------------------------------------------- */}
          {/* 4. Reports                                                      */}
          {/* ------------------------------------------------------------- */}
          {reportsTotal > 0 ? (
            <Queue
              id="reports"
              title="საჩივრები"
              count={reportsTotal}
              shown={reports.length}
              allHref="/admin/reports"
            >
              {reports.map((report) => (
                <li key={report.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="space-y-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {REPORT_REASON_KA[report.reason]}
                        {report.status === 'REVIEWING' ? (
                          <Badge className="ml-2">განხილვაში</Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {report.analystProfile ? (
                          <>
                            ავტორი:{' '}
                            <Link
                              href={`/analysts/${report.analystProfile.slug}`}
                              className="text-accent hover:underline"
                            >
                              {report.analystProfile.displayName}
                            </Link>
                          </>
                        ) : report.prediction ? (
                          <>
                            ფსონი:{' '}
                            <Link
                              href={`/free/${report.prediction.id}`}
                              className="text-accent hover:underline"
                            >
                              {report.prediction.titleKa}
                            </Link>
                          </>
                        ) : null}
                        {' · '}
                        {report.reporter?.email ?? 'ანონიმური'}
                        {' · '}
                        <span className="tabular">{formatDateTimeKa(report.createdAt)}</span>
                      </p>
                      {report.details ? (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                          {report.details}
                        </p>
                      ) : null}
                    </div>
                    <ReportDecisionForm
                      reportId={report.id}
                      status={report.status === 'REVIEWING' ? 'REVIEWING' : 'OPEN'}
                    />
                  </div>
                </li>
              ))}
            </Queue>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * One queue: a heading that says how many, a ruled list, and the way to the
 * rest when there is more than fits. Rows are separated by rules rather than
 * each boxed in a card of its own, so the eye reads down a list instead of
 * across a grid of identical containers.
 */
function Queue({
  id,
  title,
  count,
  shown,
  allHref,
  children,
}: {
  id: string;
  title: string;
  count: number;
  shown: number;
  allHref: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`queue-${id}`} className="scroll-mt-32">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={`queue-${id}`} className="font-display text-lg text-ink">
          {title}
          <span className="tabular ml-2 text-base font-normal text-ink-muted">
            {count}
          </span>
        </h2>
        <Link
          href={allHref}
          className="text-sm text-accent hover:underline"
        >
          {count > shown ? `ყველა ${count}` : 'სრული სია'}
        </Link>
      </div>
      <Card>
        <ul className="divide-y divide-line p-4 sm:p-5">{children}</ul>
      </Card>
    </section>
  );
}

/** A screenshot thumbnail that opens the full image in a new tab. */
function Slip({
  href,
  src,
  label,
}: {
  href: string;
  src: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label}: სრული ზომით`}
      className="relative block h-16 w-24 overflow-hidden rounded-card border border-line bg-canvas"
    >
      <Image src={src} alt="" fill sizes="6rem" className="object-cover" />
      <span className="absolute bottom-0 left-0 rounded-tr bg-ink/70 px-1.5 py-0.5 text-xs leading-none text-on-ink">
        {label}
      </span>
    </a>
  );
}
