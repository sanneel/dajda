import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
import { formatDateTimeKa, formatOdds, formatUnitsSigned } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { analystFeed } from '@/lib/queries/feed';
import { Feed } from '@/components/feed';
import { PostBetForm } from './post-form';
import { FinishBetForm } from './finish-form';
import { FeedComposer } from './composer';
import { LiveSessionControls } from './live-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ჩემი ფსონები',
  robots: { index: false, follow: false },
};

/**
 * Everything an analyst does, on one page.
 *
 * Posting sits at the top because it is the frequent action. Below it the
 * author's own bets are grouped by what they need from the author: live ones
 * need finishing, finished ones are waiting on an admin, and settled ones are
 * just history.
 */
export default async function AnalystPage() {
  const analyst = await requireApprovedAnalyst();

  const [sports, bets, feed, runningLive] = await Promise.all([
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
        status: true,
        visibility: true,
        publishedAt: true,
        eventAt: true,
        finishedAt: true,
        supersededAt: true,
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          ჩემი ფსონები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          დადეთ ფსონი სკრინშოტით, დაწერეთ სტატუსი ან გამოაცხადეთ ლაივი.
        </p>
      </header>

      {/*
       * Any live session still open is put first and stays there. During a
       * session this is the only control the author needs, and burying it
       * under the posting forms would make them scroll for it every time.
       */}
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

      <Card as="section">
        <CardHeader title="ახალი ფსონი" level={2} />
        <CardBody>
          <PostBetForm
            sports={sports.map((sport) => ({
              value: sport.id,
              label: sport.nameKa,
            }))}
          />
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="ფიდი"
          level={2}
          description="სტატუსი ან ლაივის გამოცხადება. ეს არ ითვლება თქვენს ჩანაწერში."
        />
        <CardBody>
          <FeedComposer />
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader title="თქვენი ფიდი" level={2} />
        <CardBody>
          <Feed entries={feed} emptyText="ჯერ არაფერი დაგიპოსტავთ." />
        </CardBody>
      </Card>

      <BetGroup
        title="მიმდინარე"
        description="გამოქვეყნებული, ჯერ დაუსრულებელი. მატჩის შემდეგ მონიშნეთ."
        bets={live}
        showFinish
        emptyText="მიმდინარე ფსონი არ გაქვთ."
      />

      <BetGroup
        title="ადმინის განხილვაში"
        description="დაასრულეთ და შედეგს ელოდება."
        bets={awaiting}
        emptyText="განსახილველი არაფერია."
      />

      {drafts.length > 0 ? (
        <BetGroup
          title="მონახაზები"
          description="ჯერ არ გამოქვეყნებულა, საჯაროდ არ ჩანს."
          bets={drafts}
          emptyText=""
        />
      ) : null}

      <BetGroup
        title="დათვლილი"
        description="შედეგი დაფიქსირებულია და ჩანაწერი დაიბლოკა."
        bets={settled}
        emptyText="ჯერ არაფერი დათვლილა."
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
  sport: { nameKa: string };
  result: { profitUnitsCenti: number; settledAt: Date } | null;
};

function BetGroup({
  title,
  description,
  bets,
  emptyText,
  showFinish = false,
}: {
  title: string;
  description: string;
  bets: Bet[];
  emptyText: string;
  showFinish?: boolean;
}) {
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
        ) : (
          <ul className="space-y-3">
            {bets.map((bet) => (
              <li
                key={bet.id}
                className="flex flex-wrap items-start gap-4 rounded-card border border-line bg-canvas p-3.5"
              >
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
                        <span className="tabular">
                          {formatDateTimeKa(bet.eventAt)}
                        </span>
                      </>
                    ) : null}
                    {bet.result ? (
                      <>
                        {' · '}
                        <span
                          className={`tabular ${
                            bet.result.profitUnitsCenti < 0
                              ? 'text-loss'
                              : 'text-win'
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
