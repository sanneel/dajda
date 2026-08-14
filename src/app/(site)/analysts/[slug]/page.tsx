import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getAnalystBySlug } from '@/lib/queries/analysts';
import { getCurrentUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import {
  cumulativeUnits,
  monthlyPerformance,
  MIN_SAMPLE_FOR_RANKING,
} from '@/lib/stats/performance';
import {
  formatDateTimeKa,
  formatOdds,
  formatPercentBps,
  formatPercentBpsSigned,
  formatUnitsSigned,
} from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Stat, RecordBar } from '@/components/ui/stat';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { CumulativeUnitsChart } from '@/components/charts/cumulative-units';
import { MonthlyBars } from '@/components/charts/monthly-bars';
import { PlanCard } from '@/components/plan-card';
import { ReportForm } from '@/components/report-form';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { SaveAnalystButton } from './save-button';

export const dynamic = 'force-dynamic';

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getAnalystBySlug(slug);

  if (!data) notFound();

  const { profile, predictions, allTime, records } = data;
  const actor = await getCurrentUser();

  const [saved, subscriptions, feed] = await Promise.all([
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
  ]);

  const statusByPlan = new Map(
    subscriptions.map((subscription) => [
      subscription.planId,
      subscription.status as 'ACTIVE' | 'PENDING',
    ]),
  );

  const cumulative = cumulativeUnits(records);
  const monthly = monthlyPerformance(records);
  const streak = allTime.currentStreak;

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
            ამ ავტორს ჯერ {allTime.decided} დათვლილი ფსონი აქვს. ასეთ
            რაოდენობაზე დაყრდნობით სიზუსტისა და ROI-ის შეფასება არასაიმედოა.
          </Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* Performance summary                                             */}
      {/* ------------------------------------------------------------- */}
      <section className="mt-8" aria-labelledby="performance-heading">
        <h2 id="performance-heading" className="sr-only">
          შედეგების მიმოხილვა
        </h2>

        <Card>
          <CardBody>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat
                label="სულ ფსონი"
                value={allTime.total}
                hint={`${allTime.pending} მოლოდინში`}
                size="lg"
              />
              <Stat
                label="მოგებული"
                value={allTime.won}
                tone="positive"
                size="lg"
              />
              <Stat
                label="წაგებული"
                value={allTime.lost}
                tone="negative"
                size="lg"
              />
              <Stat
                label="სიზუსტე"
                value={
                  allTime.decided === 0
                    ? '·'
                    : formatPercentBps(allTime.hitRateBps)
                }
                hint={`${allTime.decided} დათვლილი`}
                size="lg"
              />
              <Stat
                label="ROI"
                value={
                  allTime.decided === 0
                    ? '·'
                    : formatPercentBpsSigned(allTime.roiBps)
                }
                tone={
                  allTime.roiBps > 0
                    ? 'positive'
                    : allTime.roiBps < 0
                      ? 'negative'
                      : 'default'
                }
                hint={`${formatUnitsSigned(allTime.profitUnitsCenti)} ერთეული`}
                size="lg"
              />
              {/*
               * The streak is a count, not an omen. A flame or a snowflake
               * here would editorialise a number the hint already explains,
               * in the visual language of the bookmakers this product is not.
               */}
              <Stat
                label="მიმდინარე სერია"
                value={streak.kind === 'NONE' ? '·' : streak.count}
                tone={streak.kind === 'LOST' ? 'negative' : 'default'}
                hint={
                  streak.kind === 'WON'
                    ? 'ზედიზედ მოგება'
                    : streak.kind === 'LOST'
                      ? 'ზედიზედ წაგება'
                      : undefined
                }
                size="lg"
              />
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <RecordBar
                won={allTime.won}
                lost={allTime.lost}
                pending={allTime.pending}
              />
            </div>

          </CardBody>
        </Card>
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
      {/* Plans                                                           */}
      {/* ------------------------------------------------------------- */}
      {profile.plans.length > 0 ? (
        <section className="mt-10" aria-labelledby="plans-heading">
          <h2
            id="plans-heading"
            className="text-2xl font-semibold tracking-tight text-ink"
          >
            გამოწერა
          </h2>
          <p className="ph mt-1.5 max-w-2xl text-sm">
            [1 წინადადება: რა იხსნება გამოწერით და რა რჩება უფასოდ]
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profile.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                featured={plan.tier === 'PREMIUM'}
                isAuthenticated={Boolean(actor)}
                currentStatus={statusByPlan.get(plan.id)}
              />
            ))}
          </div>

          {/*
           * Billing terms sit at the point of purchase. They used to live on a
           * platform-wide subscriptions page; that page is gone, so the two
           * facts a buyer needs before paying have to travel with the plans.
           */}
          {/*
           * Billing terms sit at the point of purchase - there is no
           * platform-wide subscriptions page any more. The two links are real
           * because they are navigation, not copy; the sentences are not.
           */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="ph text-xs leading-relaxed">
              [3 პუნქტი გადახდამდე: (1) როდის აქტიურდება გეგმა, (2) ავტომატური
              განახლება და გაუქმება, (3) ბარათის მონაცემები]
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              <Link
                href="/dashboard"
                className="text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent"
              >
                პროფილი → გამოწერები
              </Link>
              {' · '}
              <Link
                href="/legal#refunds"
                className="text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent"
              >
                დაბრუნების პოლიტიკა
              </Link>
            </p>
          </div>
        </section>
      ) : null}

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
          <Feed entries={feed} emptyText="ავტორს ჯერ არაფერი დაუპოსტავს." />
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
                        {prediction.titleKa}
                      </a>
                      <div className="text-xs text-ink-faint">
                        {prediction.sport.nameKa}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {/* The slip, small. Proof that the row is not just a
                          claim typed into a table. */}
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
