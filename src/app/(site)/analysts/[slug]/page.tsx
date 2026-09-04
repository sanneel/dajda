import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock, SlidersHorizontal } from 'lucide-react';
import { getAnalystBySlug } from '@/lib/queries/analysts';
import { activePlanGrants, purchasedTicketIds } from '@/lib/queries/tickets';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { prisma } from '@/lib/db';
import {
  monthlyPerformance,
  oddsBucketPerformance,
  MIN_SAMPLE_FOR_RANKING,
} from '@/lib/stats/performance';
import {
  formatDateTimeKa,
  formatOdds,
  formatUnitsSigned,
} from '@/lib/format';
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Alert } from '@/components/ui/feedback';
import { RecordTabs } from './record-tabs';
import { ReportForm } from '@/components/report-form';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { SaveAnalystButton } from './save-button';
import { ButtonLink } from '@/components/ui/button';
import { AddTicketButton } from '@/components/add-ticket-button';
import { AnalystHistory } from './history';
import { Slip } from '@/components/slip';

export const dynamic = 'force-dynamic';

/**
 * `?tab=` values, as the rest of the product writes them. Anything else - a
 * typo, a stale link, nothing at all - falls back to the free record rather
 * than erroring: a bad query string is not worth a broken page.
 */
const TAB_BY_PARAM: Record<string, 'FREE' | 'PAID' | 'PLANS' | undefined> = {
  free: 'FREE',
  paid: 'PAID',
  plans: 'PLANS',
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
  const requestedTab = TAB_BY_PARAM[String((await searchParams).tab ?? '')];
  const data = await getAnalystBySlug(slug);

  if (!data) notFound();

  const { profile, predictions, allTime, freeAllTime, paidAllTime } = data;
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
   * Open paid bets keep their pick hidden here too. The profile is the public
   * record, but a record entry is a pick plus an outcome, and while the bet is
   * still running the pick is what subscribers are paying for. The row itself
   * stays visible - odds, date, status - so the count can not be gamed.
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
  const lockedBetIds = new Set(
    predictions
      .filter(
        (prediction) =>
          // A single purchase opens exactly that bet.
          !purchased.has(prediction.id) &&
          isTicketLocked(
            {
              visibility: prediction.visibility,
              authorId: profile.id,
              status: prediction.status,
            },
            viewer,
            grants,
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
  const paidCharts = chartsFor((visibility) => visibility !== 'PUBLIC');

  // Newest pin first. The cap is enforced at pin time; the slice here is
  // only a belt against rows pinned before the cap existed.
  const pinned = predictions
    .filter((prediction) => prediction.pinnedAt !== null)
    .sort(
      (a, b) =>
        (b.pinnedAt as Date).getTime() - (a.pinnedAt as Date).getTime(),
    )
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      {/* ------------------------------------------------------------- */}
      {/* Identity                                                        */}
      {/* ------------------------------------------------------------- */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={profile.displayName} size="lg" />

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
        </div>

        {/* The owner gets the action that belongs to them; everyone else gets
            the one that belongs to a reader. */}
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <AddTicketButton
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
             * The subscription button lives in the header so it is on
             * screen whichever tab the record is showing, signed in or
             * not. It is a link, not a tab switch: ?tab=plans opens the
             * subscription panel on the server and #plans lands on the
             * plan card inside it.
             */}
            {sellsSubscription ? (
              <ButtonLink
                href={`/analysts/${profile.slug}?tab=plans#plans`}
                variant={holdsPlan ? 'secondary' : 'primary'}
              >
                {holdsPlan ? 'გამოწერილია' : 'გამოწერა'}
              </ButtonLink>
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

      {profile.bio ? (
        <p className="mt-5 max-w-3xl whitespace-pre-line leading-relaxed text-ink-muted">
          {profile.bio}
        </p>
      ) : null}

      {allTime.decided < MIN_SAMPLE_FOR_RANKING ? (
        <div className="mt-5">
          <Alert tone="warning" title="მცირე შერჩევა">
            ამ ავტორს ჯერ {allTime.decided} დათვლილი პროგნოზი აქვს. ასეთ
            რაოდენობაზე დაყრდნობით სიზუსტის შეფასება არასაიმედოა.
          </Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* The record: one panel, switched between free, paid and plans.   */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-8" aria-labelledby="plans-heading">
        <RecordTabs
          free={freeAllTime}
          paid={paidAllTime}
          freeCharts={freeCharts}
          paidCharts={paidCharts}
          plans={profile.plans.map((plan) => ({
            ...plan,
            currentStatus: statusByPlan.get(plan.id),
          }))}
          isAuthenticated={Boolean(actor)}
          monthlyMinimum={profile.monthlyMinimum}
          initialTab={requestedTab}
        />
      </section>

      {/* ------------------------------------------------------------- */}
      {/* ტოპ ბილეთები: what the author chose to feature                   */}
      {/* ------------------------------------------------------------- */}
      {/*
       * Replaced the full history table. The complete record still exists -
       * the stats above are computed from every published bet and the feed
       * shows them chronologically - but the strip here is editorial: up to
       * three bets the author pinned from their workspace.
       */}
      {pinned.length > 0 ? (
        <section className="mt-10" aria-labelledby="pinned-heading">
          <h2
            id="pinned-heading"
            className="text-2xl font-semibold tracking-tight text-ink"
          >
            ტოპ ბილეთები
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            ავტორის მიერ არჩეული ბილეთები საკუთარი ჩანაწერიდან.
          </p>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pinned.map((prediction) => {
              const locked = lockedBetIds.has(prediction.id);
              const units = prediction.result?.profitUnitsCenti ?? null;

              return (
                <li
                  key={prediction.id}
                  className="overflow-hidden rounded-card border border-line bg-surface"
                >
                  {locked ? (
                    <span className="flex h-36 items-center justify-center border-b border-line bg-elevated">
                      <Lock
                        className="size-6 text-ink-faint"
                        aria-hidden="true"
                      />
                    </span>
                  ) : (
                    /* Our ticket, not the bookmaker's screenshot. */
                    <div className="h-36 border-b border-line">
                      <Slip ticket={prediction} variant="compact" />
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={`/free/${prediction.id}`}
                        className="min-w-0 font-medium text-ink hover:text-accent"
                      >
                        {locked ? 'დახურული პროგნოზი' : prediction.titleKa}
                      </a>
                      <StatusBadge status={prediction.status} />
                    </div>

                    <p className="mt-1.5 text-xs text-ink-muted">
                      {prediction.sport.nameKa}
                      {' · კოეფ. '}
                      <span className="tabular">
                        {formatOdds(prediction.oddsMilli)}
                      </span>
                      {prediction.publishedAt ? (
                        <>
                          {' · '}
                          <span className="tabular">
                            {formatDateTimeKa(prediction.publishedAt)}
                          </span>
                        </>
                      ) : null}
                      {units !== null ? (
                        <>
                          {' · '}
                          <span
                            className={`tabular font-medium ${
                              units > 0
                                ? 'text-win'
                                : units < 0
                                  ? 'text-loss'
                                  : 'text-ink-muted'
                            }`}
                          >
                            {formatUnitsSigned(units)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
      {/* The full history, split by how each ticket was sold              */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="text-2xl font-semibold tracking-tight text-ink"
        >
          ბილეთების ისტორია
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          ყველაფერი, რაც ავტორს გამოუქვეყნებია, ტიპის მიხედვით.
        </p>

        <div className="mt-5">
          <AnalystHistory
            entries={predictions
              .filter(
                (prediction) =>
                  prediction.publishedAt !== null &&
                  prediction.supersededAt === null,
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
