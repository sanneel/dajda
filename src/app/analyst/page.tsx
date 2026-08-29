import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import { formatDateTimeKa, formatMoney, formatOdds, formatUnitsSigned } from '@/lib/format';
import { summarizePerformance } from '@/lib/stats/performance';
import { formatPercentBps } from '@/lib/format';
import {
  BROADCASTS_PER_DAY,
  broadcastAllowance,
} from '@/lib/notifications/broadcast';
import { audienceFor } from '@/lib/notifications/outbox';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Stat } from '@/components/ui/stat';
import { PlanPriceForm } from './plan-price-form';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ShowMoreList } from '@/components/ui/show-more';
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { FinishBetForm } from './finish-form';
import { PinBetButton } from './pin-button';
import { AnalystComposer } from './composer';
import { LiveSessionControls } from './live-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ჩემი გვერდი',
  robots: { index: false, follow: false },
};

/**
 * The analyst's workspace.
 *
 * Ordered by what needs the analyst, not by what the database has. A running
 * live session first (during one, it is the only control they want), then the
 * numbers they are judged on, then one composer for everything they can
 * publish, then bets that need finishing. History is last and collapsed - it
 * is the largest group and the one nobody comes here to act on.
 */
export default async function AnalystPage() {
  const analyst = await requireApprovedAnalyst();

  const [sports, bets, feed, runningLive, audience, allowance, plan] =
    await Promise.all([
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
   * The record as the public sees it, computed from the same rows and the same
   * function the profile uses - an analyst should never be looking at a
   * different number from the one their readers judge them on.
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">
            ჩემი გვერდი
          </h1>
          <p className="mt-1.5 text-ink-muted">
            დადეთ პროგნოზი, დაწერეთ სტატუსი, გამოაცხადეთ ლაივი ან მიწერეთ
            გამომწერებს.
          </p>
        </div>
        <Link
          href="/analyst/earnings"
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
        >
          ანაზღაურება
        </Link>
      </header>

      {/*
       * Pricing before everything else while it is missing: an analyst with
       * no active plan cannot be subscribed to, so every bet they post earns
       * nothing until this is set. Once set, it collapses to a quiet card.
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
      ) : (
        <Card as="section">
          <CardHeader
            title="ჩემი გამოწერა"
            level={2}
            action={
              <span className="tabular text-sm text-ink-muted">
                {formatMoney(plan.priceMinor, 'GEL')} / თვე
              </span>
            }
          />
          <CardBody>
            <PlanPriceForm currentPriceMinor={plan.priceMinor} />
          </CardBody>
        </Card>
      )}

      {/* --------------------------------------------------------------- */}
      {/* A running session outranks everything: during one it is the only  */}
      {/* control the author needs.                                         */}
      {/* --------------------------------------------------------------- */}
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

      {/* --------------------------------------------------------------- */}
      {/* Where the analyst stands, in one line                             */}
      {/* --------------------------------------------------------------- */}
      <Card as="section">
        <CardBody>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="მიმდინარე პროგნოზი"
              value={live.length}
              hint={
                awaiting.length > 0
                  ? `${awaiting.length} ადმინთან`
                  : 'დასასრულებელი არაფერია'
              }
              size="lg"
            />
            <Stat
              label="მოგებების პროცენტი"
              value={
                record.decided === 0 ? '·' : formatPercentBps(record.hitRateBps)
              }
              hint={`${record.decided} დათვლილი`}
              size="lg"
            />
            <Stat
              label="პროფიტი"
              value={
                record.decided === 0
                  ? '·'
                  : formatUnitsSigned(record.profitUnitsCenti)
              }
              tone={
                record.profitUnitsCenti > 0
                  ? 'positive'
                  : record.profitUnitsCenti < 0
                    ? 'negative'
                    : 'default'
              }
              hint="ერთეული"
              size="lg"
            />
            <Stat
              label="აუდიტორია"
              value={audience.length}
              hint={`${reachable} Telegram-ში`}
              size="lg"
            />
            <Stat
              label="შეტყობინება დღეს"
              value={`${allowance.used}/${BROADCASTS_PER_DAY}`}
              hint={
                allowance.remaining > 0
                  ? `დარჩა ${allowance.remaining}`
                  : 'ლიმიტი ამოწურულია'
              }
              size="lg"
            />
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------------------------- */}
      {/* One composer for everything publishable                           */}
      {/* --------------------------------------------------------------- */}
      <Card as="section">
        <CardBody>
          <AnalystComposer
            sports={sports.map((sport) => ({
              value: sport.id,
              label: sport.nameKa,
            }))}
            audienceSize={audience.length}
            broadcastsRemaining={allowance.remaining}
            broadcastsPerDay={BROADCASTS_PER_DAY}
          />
        </CardBody>
      </Card>

      {/* --------------------------------------------------------------- */}
      {/* Bets that need the analyst                                        */}
      {/* --------------------------------------------------------------- */}
      <BetGroup
        title="მიმდინარე"
        description="გამოქვეყნებული, ჯერ დაუსრულებელი. მატჩის შემდეგ მონიშნეთ."
        bets={live}
        showFinish
        emptyText="მიმდინარე პროგნოზი არ გაქვთ."
      />

      {awaiting.length > 0 ? (
        <BetGroup
          title="ადმინის განხილვაში"
          description="დაასრულეთ და შედეგს ელოდება."
          bets={awaiting}
          emptyText=""
        />
      ) : null}

      {drafts.length > 0 ? (
        <BetGroup
          title="მონახაზები"
          description="ჯერ არ გამოქვეყნებულა, საჯაროდ არ ჩანს."
          bets={drafts}
          emptyText=""
        />
      ) : null}

      <Card as="section">
        <CardHeader
          title="თქვენი ფიდი"
          level={2}
          description="ისე, როგორც პროფილზე ჩანს."
        />
        <CardBody>
          <Feed entries={feed} emptyText="ჯერ არაფერი დაგიპოსტავთ." />
        </CardBody>
      </Card>

      <BetGroup
        title="დათვლილი"
        description="შედეგი დაფიქსირებულია და ჩანაწერი დაიბლოკა."
        bets={settled}
        emptyText="ჯერ არაფერი დათვლილა."
        collapse
      />
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
  publishedAt: Date | null;
  eventAt: Date | null;
  finishedAt: Date | null;
  pinnedAt: Date | null;
  sport: { nameKa: string };
  result: { profitUnitsCenti: number; settledAt: Date } | null;
};

function BetGroup({
  title,
  description,
  bets,
  emptyText,
  showFinish = false,
  collapse = false,
}: {
  title: string;
  description: string;
  bets: Bet[];
  emptyText: string;
  showFinish?: boolean;
  /** History is long and nobody acts on it: show a few, offer the rest. */
  collapse?: boolean;
}) {
  const rows = bets.map((bet) => (
    <BetRow key={bet.id} bet={bet} showFinish={showFinish} />
  ));

  return (
    <Card as="section">
      <CardHeader
        title={`${title} (${bets.length})`}
        level={2}
        description={description}
      />
      <CardBody>
        {bets.length === 0 ? (
          <EmptyState title={emptyText || 'ცარიელია'} />
        ) : collapse ? (
          <ShowMoreList className="-m-4 divide-y divide-line sm:-m-5" initial={5}>
            {rows}
          </ShowMoreList>
        ) : (
          <ul className="-m-4 divide-y divide-line sm:-m-5">{rows}</ul>
        )}
      </CardBody>
    </Card>
  );
}

function BetRow({ bet, showFinish }: { bet: Bet; showFinish: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
      <Link
        href={`/free/${bet.id}`}
        className="relative h-20 w-28 shrink-0 overflow-hidden rounded border border-line bg-surface"
      >
        <Image
          src={bet.screenshotPath}
          alt=""
          fill
          sizes="7rem"
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
                {formatUnitsSigned(bet.result.profitUnitsCenti)} ერთ.
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
