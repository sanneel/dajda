import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink, Ticket } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import {
  formatDateTimeKa,
  formatMoney,
  formatOdds,
  formatPercentBps,
  formatUnitsSigned,
} from '@/lib/format';
import { summarizePerformance } from '@/lib/stats/performance';
import {
  BROADCASTS_PER_DAY,
  broadcastAllowance,
} from '@/lib/notifications/broadcast';
import { audienceFor } from '@/lib/notifications/outbox';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ShowMoreList } from '@/components/ui/show-more';
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { PlanPriceForm } from './plan-price-form';
import { FinishBetForm } from './finish-form';
import { PinBetButton } from './pin-button';
import { CreateActions } from './create-actions';
import { WorkspaceTabs } from './workspace-tabs';
import { LiveSessionControls } from './live-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ჩემი გვერდი',
  robots: { index: false, follow: false },
};

/**
 * The analyst's workspace, shaped like their own page rather than an admin
 * console.
 *
 * It used to open on a stack of forms: pricing, a five-up stat block, a
 * four-tab composer with a full bet form expanded inside it, then four more
 * card sections of history. The thing an author comes here to do - post a
 * ticket and see what is running - was competing with everything they might
 * ever do.
 *
 * Now: who they are and how they are doing at the top (the same facts their
 * public profile leads with), one committed action, and their content behind
 * one set of tabs. Everything that publishes opens in a drawer.
 */
export default async function AnalystPage() {
  const analyst = await requireApprovedAnalyst();

  const [profile, sports, bets, feed, runningLive, audience, allowance, plan] =
    await Promise.all([
      prisma.analystProfile.findUniqueOrThrow({
        where: { id: analyst.analystProfileId },
        select: {
          displayName: true,
          slug: true,
          headline: true,
          sports: { select: { sport: { select: { nameKa: true } } } },
        },
      }),
      prisma.sport.findMany({
        where: { isActive: true },
        orderBy: { nameKa: 'asc' },
        select: { id: true, nameKa: true },
      }),
      prisma.prediction.findMany({
        where: { authorId: analyst.analystProfileId },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        select: {
          id: true,
          titleKa: true,
          screenshotPath: true,
          resultScreenshotPath: true,
          oddsMilli: true,
          stakeUnitsCenti: true,
          status: true,
          visibility: true,
          priceMinor: true,
          publishedAt: true,
          eventAt: true,
          finishedAt: true,
          supersededAt: true,
          pinnedAt: true,
          sport: { select: { nameKa: true } },
          result: { select: { profitUnitsCenti: true, settledAt: true } },
        },
      }),
      analystFeed(analyst.analystProfileId, 30),
      prisma.analystPost.findMany({
        where: {
          authorId: analyst.analystProfileId,
          kind: 'LIVE_NOTICE',
          endedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, liveLabelKa: true, liveAt: true },
      }),
      audienceFor(analyst.analystProfileId),
      broadcastAllowance(analyst.analystProfileId),
      prisma.subscriptionPlan.findFirst({
        where: { analystProfileId: analyst.analystProfileId, tier: 'PREMIUM' },
        select: { priceMinor: true, isActive: true },
      }),
    ]);

  const live = bets.filter(
    (bet) =>
      bet.publishedAt !== null &&
      bet.finishedAt === null &&
      bet.status === 'PENDING',
  );
  const awaiting = bets.filter(
    (bet) => bet.finishedAt !== null && bet.status === 'PENDING',
  );
  const settled = bets.filter((bet) => bet.status !== 'PENDING');
  const drafts = bets.filter((bet) => bet.publishedAt === null);

  /*
   * The record as the public sees it, from the same rows and the same function
   * the profile uses - an analyst should never look at a different number from
   * the one their readers judge them on.
   */
  const record = summarizePerformance(
    bets
      .filter((bet) => bet.publishedAt !== null && bet.supersededAt === null)
      .map((bet) => ({
        status: bet.status,
        oddsMilli: bet.oddsMilli,
        stakeUnitsCenti: bet.stakeUnitsCenti,
        profitUnitsCenti: bet.result?.profitUnitsCenti ?? null,
        publishedAt: bet.publishedAt as Date,
      })),
  );

  /** Reachable now: connected to Telegram, so a message would actually land. */
  const reachable = audience.filter(
    (person) => person.telegramChatId !== null && person.prefs?.telegramEnabled,
  ).length;

  const sportOptions = sports.map((sport) => ({
    value: sport.id,
    label: sport.nameKa,
  }));

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Identity, standing, and the one action                             */}
      {/* ----------------------------------------------------------------- */}
      <Card as="section">
        <CardBody>
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <Avatar name={profile.displayName} size="lg" />

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                  {profile.displayName}
                </h1>
                {profile.headline ? (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                    {profile.headline}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {profile.sports.map((entry) => (
                    <Badge key={entry.sport.nameKa}>{entry.sport.nameKa}</Badge>
                  ))}
                  <Link
                    href={`/analysts/${profile.slug}`}
                    className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    საჯარო გვერდი
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>

            {/*
             * Four numbers, not five: the broadcast allowance moved onto the
             * menu item that spends it, where it is actually a decision.
             */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
              <Metric
                label="მიმდინარე"
                value={String(live.length)}
                hint={
                  awaiting.length > 0
                    ? `${awaiting.length} ადმინთან`
                    : 'დასასრულებელი არაფერია'
                }
              />
              <Metric
                label="მოგებების %"
                value={
                  record.decided === 0
                    ? '·'
                    : formatPercentBps(record.hitRateBps)
                }
                hint={`${record.decided} დათვლილი`}
              />
              <Metric
                label="პროფიტი"
                value={
                  record.decided === 0
                    ? '·'
                    : formatUnitsSigned(record.profitUnitsCenti)
                }
                hint="დათვლილიდან"
                tone={
                  record.profitUnitsCenti > 0
                    ? 'win'
                    : record.profitUnitsCenti < 0
                      ? 'loss'
                      : undefined
                }
              />
              <Metric
                label="აუდიტორია"
                value={String(audience.length)}
                hint={`${reachable} Telegram-ში`}
              />
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              {/* Subscription price reads as a fact with an edit next to it,
                  not as a form the page opens on. */}
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm text-ink-muted">გამოწერა:</span>
                {plan && plan.isActive ? (
                  <>
                    <span className="tabular text-lg font-semibold text-ink">
                      {formatMoney(plan.priceMinor, 'GEL')}
                    </span>
                    <span className="text-sm text-ink-faint">/ თვე</span>
                    <details className="ml-1">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm font-medium text-accent marker:content-none hover:underline">
                        შეცვლა
                      </summary>
                      <div className="mt-3">
                        <PlanPriceForm currentPriceMinor={plan.priceMinor} />
                      </div>
                    </details>
                  </>
                ) : (
                  <span className="text-sm font-medium text-signal">
                    ჯერ არ არის გააქტიურებული
                  </span>
                )}
              </div>

              <CreateActions
                sports={sportOptions}
                audienceSize={audience.length}
                broadcastsRemaining={allowance.remaining}
                broadcastsPerDay={BROADCASTS_PER_DAY}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/*
       * Pricing is the one thing that blocks earning, so while it is missing
       * it gets a banner of its own rather than a line in the header.
       */}
      {!plan || !plan.isActive ? (
        <Alert tone="warning" title="გამოწერა ჯერ არ არის გააქტიურებული">
          <div className="space-y-3">
            <p>
              აირჩიეთ თვიური ფასი. სანამ ფასი არ არის არჩეული, თქვენს გვერდს
              გამოწერა არ აქვს და ფასიან პროგნოზებზე წვდომას ვერავინ იყიდის.
            </p>
            <PlanPriceForm currentPriceMinor={null} />
          </div>
        </Alert>
      ) : null}

      {/* A running session outranks everything: during one it is the only
          control the author needs. */}
      {runningLive.map((session) => (
        <Card as="section" key={session.id}>
          <CardHeader
            title={`ლაივი მიმდინარეობს: ${session.liveLabelKa ?? ''}`}
            level={2}
            description={
              session.liveAt
                ? `დაწყება ${formatDateTimeKa(session.liveAt)}`
                : undefined
            }
          />
          <CardBody>
            <LiveSessionControls postId={session.id} />
          </CardBody>
        </Card>
      ))}

      {/* ----------------------------------------------------------------- */}
      {/* Everything the analyst has posted, one panel at a time             */}
      {/* ----------------------------------------------------------------- */}
      <Card as="section">
        <CardBody>
          <WorkspaceTabs
            tabs={[
              {
                id: 'current',
                label: 'მიმდინარე',
                count: live.length + awaiting.length,
                panel: (
                  <div className="space-y-6">
                    <BetList
                      bets={live}
                      showFinish
                      empty="მიმდინარე ბილეთი არ გაქვთ. დაამატეთ პირველი."
                    />
                    {awaiting.length > 0 ? (
                      <section>
                        <h3 className="rule-label mb-3 text-ink-faint">
                          ადმინის განხილვაში
                        </h3>
                        <BetList bets={awaiting} empty="" />
                      </section>
                    ) : null}
                  </div>
                ),
              },
              {
                id: 'feed',
                label: 'ფიდი',
                panel: (
                  <Feed entries={feed} emptyText="ჯერ არაფერი დაგიპოსტავთ." />
                ),
              },
              {
                id: 'settled',
                label: 'დათვლილი',
                count: settled.length,
                panel: (
                  <BetList
                    bets={settled}
                    empty="ჯერ არაფერი დათვლილა."
                    collapse
                  />
                ),
              },
              {
                id: 'drafts',
                label: 'მონახაზები',
                count: drafts.length,
                panel: (
                  <BetList
                    bets={drafts}
                    empty="მონახაზი არ გაქვთ."
                  />
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'win' | 'loss';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={`tabular mt-0.5 text-2xl font-semibold tracking-tight ${
          tone === 'win'
            ? 'text-win'
            : tone === 'loss'
              ? 'text-loss'
              : 'text-ink'
        }`}
      >
        {value}
      </dd>
      <dd className="mt-0.5 text-xs text-ink-faint">{hint}</dd>
    </div>
  );
}

type Bet = {
  id: string;
  titleKa: string;
  screenshotPath: string;
  resultScreenshotPath: string | null;
  oddsMilli: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PUSH';
  visibility: 'PUBLIC' | 'PREMIUM' | 'VIP';
  priceMinor: number | null;
  publishedAt: Date | null;
  eventAt: Date | null;
  finishedAt: Date | null;
  pinnedAt: Date | null;
  sport: { nameKa: string };
  result: { profitUnitsCenti: number; settledAt: Date } | null;
};

function BetList({
  bets,
  empty,
  showFinish = false,
  collapse = false,
}: {
  bets: Bet[];
  empty: string;
  showFinish?: boolean;
  /** History is long and nobody acts on it: show a few, offer the rest. */
  collapse?: boolean;
}) {
  if (bets.length === 0) {
    return empty ? (
      <EmptyState
        icon={<Ticket className="size-7" aria-hidden="true" />}
        title={empty}
      />
    ) : null;
  }

  const rows = bets.map((bet) => (
    <BetRow key={bet.id} bet={bet} showFinish={showFinish} />
  ));

  return collapse ? (
    <ShowMoreList className="divide-y divide-line" initial={5}>
      {rows}
    </ShowMoreList>
  ) : (
    <ul className="divide-y divide-line">{rows}</ul>
  );
}

function BetRow({ bet, showFinish }: { bet: Bet; showFinish: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-4 py-4 first:pt-0">
      <Link
        href={`/free/${bet.id}`}
        className="relative h-16 w-24 shrink-0 overflow-hidden rounded border border-line bg-surface"
      >
        <Image
          src={bet.screenshotPath}
          alt=""
          fill
          sizes="6rem"
          className="object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/free/${bet.id}`}
            className="font-medium text-ink hover:text-accent"
          >
            {bet.titleKa}
          </Link>
          {bet.visibility === 'PUBLIC' ? (
            <Badge tone="accent">უფასო</Badge>
          ) : bet.priceMinor !== null ? (
            <Badge>{formatMoney(bet.priceMinor, 'GEL')}</Badge>
          ) : null}
          {bet.publishedAt === null ? <Badge>მონახაზი</Badge> : null}
          <StatusBadge status={bet.status} />
        </div>

        <p className="mt-1 text-xs text-ink-muted">
          {bet.sport.nameKa}
          {' · კოეფ. '}
          <span className="tabular">{formatOdds(bet.oddsMilli)}</span>
          {bet.eventAt ? (
            <>
              {' · '}
              <span className="tabular">{formatDateTimeKa(bet.eventAt)}</span>
            </>
          ) : null}
          {bet.result ? (
            <>
              {' · '}
              <span
                className={`tabular ${
                  bet.result.profitUnitsCenti < 0 ? 'text-loss' : 'text-win'
                }`}
              >
                {formatUnitsSigned(bet.result.profitUnitsCenti)}
              </span>
            </>
          ) : null}
        </p>

        {bet.finishedAt && bet.status === 'PENDING' ? (
          <p className="mt-1 text-xs text-ink-faint">
            {bet.resultScreenshotPath
              ? 'შედეგის სკრინშოტი გაგზავნილია.'
              : 'შედეგის სკრინშოტის გარეშე. ადმინი ხელით შეამოწმებს.'}
          </p>
        ) : null}

        {showFinish ? (
          <div className="mt-3">
            <FinishBetForm predictionId={bet.id} />
          </div>
        ) : null}

        {bet.publishedAt !== null ? (
          <div className="mt-3">
            <PinBetButton
              predictionId={bet.id}
              pinned={bet.pinnedAt !== null}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}
