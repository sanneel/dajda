import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * An analyst's feed: their posts and their bets, in one time order.
 *
 * The two are merged in memory rather than in SQL. They are different tables
 * with different lifecycles on purpose, and a UNION would either need a shared
 * view to maintain or a set of casts that hide which row came from where. At
 * feed sizes (one author, a page at a time) two indexed reads and a sort cost
 * nothing, and the merged type stays explicit about what each entry is.
 */

const postSelect = {
  id: true,
  kind: true,
  bodyKa: true,
  liveAt: true,
  liveLabelKa: true,
  endedAt: true,
  visibility: true,
  createdAt: true,
  updates: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, bodyKa: true, createdAt: true },
  },
} satisfies Prisma.AnalystPostSelect;

const betSelect = {
  id: true,
  titleKa: true,
  screenshotPath: true,
  oddsMilli: true,
  status: true,
  visibility: true,
  publishedAt: true,
  // `code` drives the sport glyph a withheld bet shows instead of its slip.
  sport: { select: { code: true, nameKa: true } },
  result: { select: { profitUnitsCenti: true } },
} satisfies Prisma.PredictionSelect;

export type FeedPost = Prisma.AnalystPostGetPayload<{
  select: typeof postSelect;
}>;
export type FeedBet = Prisma.PredictionGetPayload<{
  select: typeof betSelect;
}>;

export type FeedEntry =
  | { type: 'post'; at: Date; post: FeedPost }
  | { type: 'bet'; at: Date; bet: FeedBet };

export async function analystFeed(
  analystProfileId: string,
  limit = 30,
): Promise<FeedEntry[]> {
  const [posts, bets] = await Promise.all([
    prisma.analystPost.findMany({
      // Updates are nested under their notice, so they never appear loose.
      where: { authorId: analystProfileId, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: postSelect,
    }),
    prisma.prediction.findMany({
      where: {
        authorId: analystProfileId,
        publishedAt: { not: null },
        supersededAt: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: betSelect,
    }),
  ]);

  const entries: FeedEntry[] = [
    ...posts.map(
      (post): FeedEntry => ({ type: 'post', at: post.createdAt, post }),
    ),
    // PUBLISHED guarantees a non-null publishedAt.
    ...bets.map(
      (bet): FeedEntry => ({ type: 'bet', at: bet.publishedAt as Date, bet }),
    ),
  ];

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  return entries.slice(0, limit);
}

/**
 * Live sessions that are running right now, across every analyst.
 *
 * "Running" is deliberately not `liveAt <= now`: an analyst announces ahead of
 * time and then ends the session by hand, so a notice counts as live from the
 * moment it is posted until its author closes it. A stale session is the
 * author's problem to close, and pretending it ended on a timer would show
 * readers a session that nobody is actually posting into.
 */
export async function runningLiveSessions(limit = 5) {
  return prisma.analystPost.findMany({
    where: { kind: 'LIVE_NOTICE', endedAt: null, visibility: 'PUBLIC' },
    orderBy: { liveAt: 'asc' },
    take: limit,
    select: {
      id: true,
      bodyKa: true,
      liveAt: true,
      liveLabelKa: true,
      author: { select: { slug: true, displayName: true } },
      _count: { select: { updates: true } },
    },
  });
}
