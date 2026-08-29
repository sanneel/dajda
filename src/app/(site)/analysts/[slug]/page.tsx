import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
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
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { RecordTabs } from './record-tabs';
import { ReportForm } from '@/components/report-form';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { SaveAnalystButton } from './save-button';

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

  const [saved, subscriptions, feed, grants, purchased] = await Promise.all([
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
    analystFeed(profile.id, 20),
    activePlanGrants(actor?.userId),
    purchasedTicketIds(actor?.userId),
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

        {actor ? (
          <SaveAnalystButton
            analystProfileId={profile.id}
            initiallySaved={saved > 0}
          />
        ) : null}
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
          initialTab={requestedTab}
        />
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Feed: what the author says, next to what they bet               */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="feed-heading">
        <h2
          id="feed-heading"
          className="text-2xl font-semibold tracking-tight text-ink"
        >
          ფიდი
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          სტატუსები, ლაივები და ფსონები ერთ ქრონოლოგიაში. მხოლოდ ფსონები
          ითვლება ზემოთ მოცემულ სტატისტიკაში.
        </p>

        <div className="mt-4">
          <Feed
            entries={feed}
            emptyText="ავტორს ჯერ არაფერი დაუპოსტავს."
            lockedBetIds={lockedBetIds}
          />
        </div>
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
                    <a
                      href={prediction.screenshotPath}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block h-36 border-b border-line bg-canvas"
                    >
                      <Image
                        src={prediction.screenshotPath}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 20rem, 100vw"
                        className="object-cover"
                      />
                    </a>
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
                            {formatUnitsSigned(units)} ერთ.
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

      <div className="mt-8">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
