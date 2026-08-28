import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getAnalystBySlug } from '@/lib/queries/analysts';
import { activePlanGrants } from '@/lib/queries/tickets';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { prisma } from '@/lib/db';
import {
  cumulativeUnits,
  monthlyPerformance,
  MIN_SAMPLE_FOR_RANKING,
} from '@/lib/stats/performance';
import {
  formatDateTimeKa,
  formatOdds,
  formatUnitsSigned,
} from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { CumulativeUnitsChart } from '@/components/charts/cumulative-units';
import { MonthlyBars } from '@/components/charts/monthly-bars';
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

  const { profile, predictions, allTime, freeAllTime, paidAllTime, records } =
    data;
  const actor = await getCurrentUser();

  const [saved, subscriptions, feed, grants] = await Promise.all([
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
      .filter((prediction) =>
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

  const cumulative = cumulativeUnits(records);
  const monthly = monthlyPerformance(records);

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
          plans={profile.plans.map((plan) => ({
            ...plan,
            currentStatus: statusByPlan.get(plan.id),
          }))}
          isAuthenticated={Boolean(actor)}
          initialTab={requestedTab}
        />
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Charts                                                          */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="კუმულაციური ერთეულები"
            description="დათვლილი ფსონების მიხედვით, ნულოვანი ხაზი: წამგებიანობის ზღვარი."
          />
          <CardBody>
            <CumulativeUnitsChart points={cumulative} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="თვიური შედეგი"
            description="მოგებიანი და წამგებიანი თვეები ერთნაირად ჩანს."
          />
          <CardBody>
            <MonthlyBars buckets={monthly} />
          </CardBody>
        </Card>
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
      {/* Full history                                                    */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="text-2xl font-semibold tracking-tight text-ink"
        >
          ფსონების ისტორია
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          სრული სია, შედეგის მიხედვით გაუფილტრავად.
        </p>

        {predictions.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="გამოქვეყნებული ფსონი ჯერ არ არის" />
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                {profile.displayName}: გამოქვეყნებული ფსონების სრული სია
              </caption>
              <thead>
                <tr className="border-b border-line bg-elevated text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                    მატჩი
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                    სკრინშოტი
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                    კოეფ.
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                    გამოქვეყნდა
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                    შედეგი
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-ink-muted">
                    ერთეული
                  </th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((prediction) => (
                  <tr
                    key={prediction.id}
                    className="border-b border-line last:border-0 hover:bg-elevated"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/free/${prediction.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {lockedBetIds.has(prediction.id) ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Lock
                              className="size-3.5 text-ink-faint"
                              aria-hidden="true"
                            />
                            დახურული პროგნოზი
                          </span>
                        ) : (
                          prediction.titleKa
                        )}
                      </a>
                      <div className="text-xs text-ink-faint">
                        {prediction.sport.nameKa}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {/* The slip, small. Proof that the row is not just a
                          claim typed into a table. A locked bet shows no slip,
                          because the slip IS the pick being sold. */}
                      {lockedBetIds.has(prediction.id) ? (
                        <span className="flex h-12 w-16 items-center justify-center rounded border border-line bg-elevated">
                          <Lock
                            className="size-4 text-ink-faint"
                            aria-hidden="true"
                          />
                        </span>
                      ) : (
                        <a
                          href={prediction.screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="relative block h-12 w-16 overflow-hidden rounded border border-line bg-canvas"
                        >
                          <Image
                            src={prediction.screenshotPath}
                            alt=""
                            fill
                            sizes="4rem"
                            className="object-cover"
                          />
                        </a>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 text-ink">
                      {formatOdds(prediction.oddsMilli)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {prediction.publishedAt
                        ? formatDateTimeKa(prediction.publishedAt)
                        : '·'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={prediction.status} />
                    </td>
                    <td
                      className={`tabular px-4 py-3 text-right font-medium ${
                        (prediction.result?.profitUnitsCenti ?? 0) > 0
                          ? 'text-win'
                          : (prediction.result?.profitUnitsCenti ?? 0) < 0
                            ? 'text-loss'
                            : 'text-ink-muted'
                      }`}
                    >
                      {prediction.result
                        ? formatUnitsSigned(prediction.result.profitUnitsCenti)
                        : '·'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
