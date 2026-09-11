import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { getAnalystBySlug } from '@/lib/queries/analysts';
import { activePlanGrants, purchasedTicketIds } from '@/lib/queries/tickets';
import { isTicketStillActive } from '@/lib/tickets/active';
import { payoutPeriod } from '@/lib/payouts/rules';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { prisma } from '@/lib/db';
import {
  monthlyPerformance,
  oddsBucketPerformance,
} from '@/lib/stats/performance';
import {
  formatMoney,
} from '@/lib/format';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { RecordTabs } from './record-tabs';
import { ReportForm } from '@/components/report-form';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { SaveAnalystButton } from './save-button';
import { SubscribeButton } from './subscribe-button';
import { AddTicketButton } from '@/components/add-ticket-button';
import { AnalystHistory } from './history';

export const dynamic = 'force-dynamic';

/**
 * `?tab=` values, as the rest of the product writes them. Anything else - a
 * typo, a stale link, nothing at all - falls back to the free record rather
 * than erroring: a bad query string is not worth a broken page.
 */
const TAB_BY_PARAM: Record<string, 'FREE' | 'PAID' | 'SUB' | undefined> = {
  free: 'FREE',
  paid: 'PAID',
  plans: 'SUB',
  subscribe: 'SUB',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getAnalystBySlug(slug);
  if (!data) return { title: 'ანალიტიკოსი ვერ მოიძებნა' };

  return {
    title: data.profile.displayName,
    description:
      data.profile.headline ??
      `${data.profile.displayName}: სპორტული ფსონების სრული ისტორია.`,
  };
}

export default async function AnalystProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  /*
   * Which panel to open, carried by whoever linked here.
   *
   * The point is that the panel answers the question the reader arrived with:
   * from the free feed they are comparing free records, from the paid feed
   * paid ones, and from the analyst listing they are shopping, so they get the
   * plans. A query parameter rather than the hash so the SERVER picks it -
   * reading location.hash could only happen after hydration, which means
   * rendering the wrong panel first and swapping it under the reader.
   */
  const query = await searchParams;
  const requestedTab = TAB_BY_PARAM[String(query.tab ?? '')];
  // A "გამოწერა" link from elsewhere on the site: open the plan dialog at once.
  const wantsSubscribe = query.subscribe === '1';
  const data = await getAnalystBySlug(slug);

  if (!data) notFound();

  const {
    profile,
    predictions,
    freeAllTime,
    paidAllTime,
    subscriptionAllTime,
  } = data;
  const actor = await getCurrentUser();

  const isOwnerEarly = actor?.analystProfileId === profile.id;

  const [saved, subscriptions, grants, purchased, sports] = await Promise.all([
    actor
      ? prisma.savedAnalyst.count({
          where: { userId: actor.userId, analystProfileId: profile.id },
        })
      : Promise.resolve(0),
    actor
      ? prisma.userSubscription.findMany({
          where: {
            userId: actor.userId,
            status: { in: ['ACTIVE', 'PENDING'] },
            plan: { analystProfileId: profile.id },
          },
          select: { planId: true, status: true },
        })
      : Promise.resolve([]),
    activePlanGrants(actor?.userId),
    purchasedTicketIds(actor?.userId),
    // Only the owner is offered the post form, so only they need the list.
    isOwnerEarly
      ? prisma.sport.findMany({
          where: { isActive: true },
          orderBy: { nameKa: 'asc' },
          select: { id: true, nameKa: true },
        })
      : Promise.resolve([]),
  ]);

  const statusByPlan = new Map(
    subscriptions.map((subscription) => [
      subscription.planId,
      subscription.status as 'ACTIVE' | 'PENDING',
    ]),
  );

  /*
   * Paid bets keep their pick hidden here, settled ones included. The profile
   * is the public record, and it stays checkable without giving the goods
   * away: every row is listed with its odds, its date and its outcome, and
   * every row counts in the totals. What a reader who did not pay never sees
   * is the pick itself.
   */
  const viewer = actor
    ? { role: actor.role, analystProfileId: actor.analystProfileId }
    : null;

  /** The author, looking at their own page. */
  const isOwner = actor?.analystProfileId === profile.id;
  // The header's subscribe button: only when something is for sale, and
  // worded differently for a reader who already pays.
  const sellsSubscription = profile.plans.some((plan) => plan.priceMinor > 0);
  const holdsPlan = [...statusByPlan.values()].includes('ACTIVE');
  const lowestPriceMinor = Math.min(
    ...profile.plans.filter((plan) => plan.priceMinor > 0).map((plan) => plan.priceMinor),
  );
  const now = new Date();
  // This Tbilisi calendar month: the same period a payout is judged on, and
  // the same rows (a corrected ticket counts once).
  const month = payoutPeriod(now);
  const publishedThisMonth = predictions.filter(
    (prediction) =>
      prediction.publishedAt !== null &&
      prediction.supersededAt === null &&
      prediction.publishedAt >= month.start &&
      prediction.publishedAt < month.end,
  ).length;
  const lockedBetIds = new Set(
    predictions
      .filter((prediction) =>
        isTicketLocked(
          {
            visibility: prediction.visibility,
            authorId: profile.id,
            status: prediction.status,
          },
          viewer,
          grants,
          purchased.has(prediction.id),
        ),
      )
      .map((prediction) => prediction.id),
  );

  /*
   * Chart inputs per slice, from the same rows the summaries use. The free
   * tab charts the free record and the paid tab the paid one - a reader
   * switching the panel switches the whole story, not just five numbers.
   */
  const chartsFor = (
    visibility: (value: (typeof predictions)[number]['visibility']) => boolean,
  ) => {
    const slice = predictions
      .filter((prediction) => visibility(prediction.visibility))
      .map((prediction) => ({
        status: prediction.status,
        oddsMilli: prediction.oddsMilli,
        stakeUnitsCenti: prediction.stakeUnitsCenti,
        profitUnitsCenti: prediction.result?.profitUnitsCenti ?? null,
        publishedAt: prediction.publishedAt as Date,
      }));
    return {
      monthly: monthlyPerformance(slice),
      oddsBuckets: oddsBucketPerformance(slice),
    };
  };
  const freeCharts = chartsFor((visibility) => visibility === 'PUBLIC');
  // Three products, three slices. PREMIUM and VIP shared one until
  // 2026-09-10, which made the paid and subscription panels identical.
  const paidCharts = chartsFor((visibility) => visibility === 'PREMIUM');
  const subscriptionCharts = chartsFor((visibility) => visibility === 'VIP');

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      {/* ------------------------------------------------------------- */}
      {/* Identity                                                        */}
      {/* ------------------------------------------------------------- */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={profile.displayName} src={profile.photoPath} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {profile.displayName}
            </h1>
            {profile.isDemo ? <DemoBadge /> : null}
          </div>

          {profile.headline ? (
            <p className="mt-1.5 text-lg text-ink-muted">{profile.headline}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.sports.map((entry) => (
              <Badge key={entry.sport.code}>{entry.sport.nameKa}</Badge>
            ))}
          </div>

          {/*
           * The promise and how it is going, where a buyer reads it before
           * paying: what the author declared for a month, and how many they
           * have published in this calendar month so far.
           */}
          <p className="mt-3 text-sm text-ink-muted">
            {profile.monthlyMinimum !== null ? (
              <>
                თვეში მინიმუმ{' '}
                <span className="tabular text-ink">{profile.monthlyMinimum}</span>{' '}
                პროგნოზი ·{' '}
              </>
            ) : null}
            ამ თვეში გამოქვეყნდა{' '}
            <span className="tabular text-ink">{publishedThisMonth}</span>
          </p>
        </div>

        {/* The owner gets the action that belongs to them; everyone else gets
            the one that belongs to a reader. */}
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <AddTicketButton
              canPostSubscription={sellsSubscription}
              sports={sports.map((sport) => ({
                value: sport.id,
                label: sport.nameKa,
              }))}
            />
            {/* The workspace is no longer a second profile standing beside
                this one in the nav; it is what this page cannot show -
                drafts, settling, pricing, broadcasts - and it is reached
                from here. */}
            <Link
              href="/analyst"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              მართვა
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/*
             * The subscription lives in the header, top right, so it is on
             * screen whichever tab the record is showing, signed in or not.
             * The button opens the plan in a dialog; a reader who arrived
             * through a "გამოწერა" link elsewhere (?subscribe=1) finds it
             * already open.
             */}
            {sellsSubscription ? (
              <SubscribeButton
                label={
                  holdsPlan
                    ? 'გამოწერილია'
                    : `გამოწერა · ${formatMoney(lowestPriceMinor)} / თვე`
                }
                plans={profile.plans
                  .filter((plan) => plan.priceMinor > 0)
                  .map((plan) => ({
                    ...plan,
                    currentStatus: statusByPlan.get(plan.id),
                  }))}
                isAuthenticated={Boolean(actor)}
                monthlyMinimum={profile.monthlyMinimum}
                owned={holdsPlan}
                openOnMount={wantsSubscribe}
              />
            ) : null}
            {actor ? (
              <SaveAnalystButton
                analystProfileId={profile.id}
                initiallySaved={saved > 0}
              />
            ) : null}
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------- */}
      {/* The record: one panel, switched between free, paid and plans.   */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-8" aria-labelledby="plans-heading">
        <RecordTabs
          free={freeAllTime}
          paid={paidAllTime}
          subscription={subscriptionAllTime}
          freeCharts={freeCharts}
          paidCharts={paidCharts}
          subscriptionCharts={subscriptionCharts}
          plans={profile.plans.map((plan) => ({
            ...plan,
            currentStatus: statusByPlan.get(plan.id),
          }))}
          initialTab={requestedTab}
        />
      </section>


      {/* Reporting is for readers. An author looking at their own page has an
          edit route for anything wrong on it, not a complaints box aimed at
          themselves. */}
      {isOwner ? null : (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface p-4">
          <p className="text-sm text-ink-muted">
            შეამჩნიეთ არაზუსტი შედეგი ან შეცდომაში შემყვანი ჩანაწერი?
          </p>
          <ReportForm
            targetType="ANALYST"
            targetId={profile.id}
            label="ავტორზე საჩივრის დაფიქსირება"
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* What is running right now, split by how each ticket is sold      */}
      {/* ------------------------------------------------------------- */}
      {/*
       * Open tickets only. This used to be the full history, which put a
       * settled bet from August next to one kicking off tonight and answered
       * neither "what can I buy" nor "how has this author done". The second
       * question is the panel above, computed from every published ticket
       * including these; this list is the first.
       */}
      <section className="mt-10" aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="text-2xl font-semibold tracking-tight text-ink"
        >
          აქტიური ბილეთები
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          რაც ავტორს ახლა აქვს გაშვებული, ტიპის მიხედვით. ბილეთი აქტიურია
          პირველი პოზიციის დაწყებამდე; ვინც მას ფლობს, მისთვის ბოლო პოზიციის
          დაწყებამდე. დათვლილი ბილეთები ზემოთ, ჩანაწერში ითვლება.
        </p>

        <div className="mt-5">
          <AnalystHistory
            entries={predictions
              .filter(
                (prediction) =>
                  prediction.publishedAt !== null &&
                  prediction.supersededAt === null &&
                  prediction.status === 'PENDING' &&
                  isTicketStillActive(
                    prediction,
                    // Only a sold ticket has a holder. A free one is open to
                    // every signed-in reader, which is not holding it.
                    prediction.visibility !== 'PUBLIC' &&
                      !lockedBetIds.has(prediction.id),
                    now,
                  ),
              )
              .map((prediction) => ({
                id: prediction.id,
                /*
                 * Withheld HERE, on the server. AnalystHistory is a client
                 * component, so anything placed on this object reaches the
                 * browser whether or not it is rendered - and an open paid
                 * pick's title is the merchandise.
                 */
                titleKa: lockedBetIds.has(prediction.id)
                  ? null
                  : prediction.titleKa,
                oddsMilli: prediction.oddsMilli,
                visibility: prediction.visibility,
                priceMinor: prediction.priceMinor,
                status: prediction.status,
                publishedAt:
                  prediction.publishedAt?.toISOString() ?? null,
                sportNameKa: prediction.sport.nameKa,
              }))}
          />
        </div>
      </section>

      <div className="mt-8">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
