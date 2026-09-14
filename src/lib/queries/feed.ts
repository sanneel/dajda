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

/** Who wrote it. Carried on every entry, shown only where it is not obvious. */
const authorSelect = {
  displayName: true,
  slug: true,
  photoPath: true,
} satisfies Prisma.AnalystProfileSelect;

const postSelect = {
  id: true,
  author: { select: authorSelect },
  bodyKa: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.AnalystPostSelect;

const betSelect = {
  id: true,
  titleKa: true,
  // The author's own id decides access; `author` is what the row shows.
  authorId: true,
  author: { select: authorSelect },
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
      // Top-level only. Live sessions are gone, but their replies are still
      // rows and must not surface as loose posts.
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
 * The reader's own feed: the authors they pay for and the ones they follow.
 *
 * Both, and in one timeline, because from the reader's side they are the same
 * act - "I want to see what this person posts". Paying adds access to what is
 * posted; it is not a second kind of interest, and splitting them would make
 * the reader check two places for one answer.
 *
 * A subscription counts while it is ACTIVE. One that lapsed stops feeding the
 * timeline, which is the same rule the rest of the product applies to access,
 * and a reader who wants to keep seeing an author after the money stops can
 * follow them.
 */
export async function personalFeedSources(userId: string): Promise<string[]> {
  const [subscriptions, saved] = await Promise.all([
    prisma.userSubscription.findMany({
      where: { userId, status: 'ACTIVE', plan: { analystProfileId: { not: null } } },
      select: { plan: { select: { analystProfileId: true } } },
    }),
    prisma.savedAnalyst.findMany({
      where: { userId },
      select: { analystProfileId: true },
    }),
  ]);

  return [
    ...new Set([
      ...subscriptions.flatMap((subscription) =>
        subscription.plan.analystProfileId
          ? [subscription.plan.analystProfileId]
          : [],
      ),
      ...saved.map((row) => row.analystProfileId),
    ]),
  ];
}

export async function personalFeed(
  userId: string,
  limit = 40,
): Promise<FeedEntry[]> {
  const authorIds = await personalFeedSources(userId);
  if (authorIds.length === 0) return [];

  const [posts, bets] = await Promise.all([
    prisma.analystPost.findMany({
      where: { authorId: { in: authorIds }, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: postSelect,
    }),
    prisma.prediction.findMany({
      where: {
        authorId: { in: authorIds },
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
    ...bets.map(
      (bet): FeedEntry => ({ type: 'bet', at: bet.publishedAt as Date, bet }),
    ),
  ];

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  return entries.slice(0, limit);
}
