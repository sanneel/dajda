import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { PlanTier } from '@/generated/prisma/enums';
import type { TicketFilter } from '@/lib/validation/schemas';

/**
 * Bet read models.
 *
 * Only published, non-superseded rows are ever returned to the public surface:
 * a draft has made no claim yet, and a superseded version is still visible on
 * the correction's own page but must not appear twice in a feed.
 *
 * A bet has two possible shapes and the difference matters everywhere below:
 *
 *   - an ANALYST bet has an `author`, counts toward that analyst's public
 *     record, and may sit behind their paywall;
 *   - a COMMUNITY free ticket has no author, counts toward nobody's record,
 *     and is always public.
 *
 * `author` is therefore nullable in every select here, and `postedBy` is the
 * one field that is always present.
 */

export const TICKET_PAGE_SIZE = 12;

const publicTicketSelect = {
  id: true,
  titleKa: true,
  descriptionKa: true,
  screenshotPath: true,
  resultScreenshotPath: true,
  status: true,
  visibility: true,
  oddsMilli: true,
  priceMinor: true,
  publishedAt: true,
  eventAt: true,
  finishedAt: true,
  version: true,
  sport: { select: { code: true, nameKa: true } },
  author: {
    select: { id: true, slug: true, displayName: true, isDemo: true },
  },
  postedBy: { select: { id: true, name: true } },
  result: {
    select: { profitUnitsCenti: true, settledAt: true, outcome: true },
  },
} satisfies Prisma.PredictionSelect;

export type PublicTicket = Prisma.PredictionGetPayload<{
  select: typeof publicTicketSelect;
}>;

/** A tick's direction on the feed's combinable sort bar. */
export type TickDirection = 'high' | 'low';

/**
 * A feed row: the ticket plus the two things a buyer reads next to it - the
 * author's record (win rate for the column, profit for the sort) and, on the
 * paid feed, what unlocking the author's tier costs per period.
 */
export type FeedTicket = PublicTicket & {
  /** Null for a community ticket, or an author with nothing decided yet. */
  authorHitRateBps: number | null;
  authorDecided: number;
  authorProfitUnitsCenti: number | null;
  /**
   * Only set on the paid feed: the ticket's own single-purchase price.
   * Falls back to the author's tier plan price for paid bets posted before
   * per-ticket pricing existed (shown per period in that case).
   */
  feedPriceMinor: number | null;
  priceCurrency: string | null;
  priceBillingPeriod: 'MONTHLY' | 'QUARTERLY' | null;
};

/**
 * One implementation for both feeds; only the visibility filter differs.
 *
 * PUBLIC stays strictly out of PAID and vice versa, so a paid bet can never
 * leak into the free list through a filter. Listing is still not showing:
 * whether a viewer sees the pick or a locked row is decided per row by
 * `isTicketLocked` at the page.
 *
 * Rows are fetched unpaginated and sorted in memory. Both orders depend on
 * per-author aggregates that SQL would need a maintained materialised view
 * for, and the whole table is hundreds of rows - the read below costs less
 * than keeping that view honest.
 */
async function listTicketFeed(kind: 'FREE' | 'PAID', filter: TicketFilter) {
  const where: Prisma.PredictionWhereInput = {
    publishedAt: { not: null },
    supersededAt: null,
    visibility: kind === 'FREE' ? 'PUBLIC' : { in: ['PREMIUM', 'VIP'] },
    ...(filter.sport ? { sport: { code: filter.sport } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };

  const rows = await prisma.prediction.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    select: publicTicketSelect,
  });

  const authorIds = [
    ...new Set(
      rows.flatMap((row) => (row.author ? [row.author.id] : [])),
    ),
  ];

  // Every author's decided record, in one query. The record spans ALL their
  // published bets, free and paid alike - the column answers "who is this
  // author", not "how did this feed do".
  const recordRows = authorIds.length
    ? await prisma.prediction.findMany({
        where: {
          authorId: { in: authorIds },
          publishedAt: { not: null },
          supersededAt: null,
          status: { in: ['WON', 'LOST'] },
        },
        select: {
          authorId: true,
          status: true,
          result: { select: { profitUnitsCenti: true } },
        },
      })
    : [];

  const recordByAuthor = new Map<
    string,
    { won: number; decided: number; profitUnitsCenti: number }
  >();
  for (const row of recordRows) {
    if (row.authorId === null) continue;
    const bucket = recordByAuthor.get(row.authorId) ?? {
      won: 0,
      decided: 0,
      profitUnitsCenti: 0,
    };
    bucket.decided += 1;
    if (row.status === 'WON') bucket.won += 1;
    bucket.profitUnitsCenti += row.result?.profitUnitsCenti ?? 0;
    recordByAuthor.set(row.authorId, bucket);
  }

  // The unlock price per (author, tier), paid feed only.
  const planRows =
    kind === 'PAID' && authorIds.length
      ? await prisma.subscriptionPlan.findMany({
          where: {
            analystProfileId: { in: authorIds },
            isActive: true,
            tier: { in: ['PREMIUM', 'VIP'] },
          },
          select: {
            analystProfileId: true,
            tier: true,
            priceMinor: true,
            currency: true,
            billingPeriod: true,
          },
        })
      : [];
  const planByAuthorTier = new Map(
    planRows.map((plan) => [`${plan.analystProfileId}:${plan.tier}`, plan]),
  );

  const enriched: FeedTicket[] = rows.map((row) => {
    const record = row.author ? recordByAuthor.get(row.author.id) : undefined;
    const plan = row.author
      ? planByAuthorTier.get(`${row.author.id}:${row.visibility}`)
      : undefined;

    return {
      ...row,
      authorHitRateBps:
        record && record.decided > 0
          ? Math.round((record.won * 10_000) / record.decided)
          : null,
      authorDecided: record?.decided ?? 0,
      authorProfitUnitsCenti: record ? record.profitUnitsCenti : null,
      feedPriceMinor:
        kind === 'PAID' ? (row.priceMinor ?? plan?.priceMinor ?? null) : null,
      priceCurrency: plan?.currency ?? 'GEL',
      // A per-ticket price is one-off; only a plan-price fallback has a period.
      priceBillingPeriod:
        row.priceMinor !== null ? null : (plan?.billingPeriod ?? null),
    };
  });

  sortFeed(enriched, filter);

  const page = filter.page ?? 1;
  const total = enriched.length;

  return {
    items: enriched.slice((page - 1) * TICKET_PAGE_SIZE, page * TICKET_PAGE_SIZE),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / TICKET_PAGE_SIZE)),
  };
}

function sortFeed(items: FeedTicket[], filter: TicketFilter, now = Date.now()) {
  const publishedDesc = (a: FeedTicket, b: FeedTicket) =>
    (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);

  // "What can still be acted on": nearest kickoff first; everything already
  // started or without a time falls back behind, newest-published.
  const upcoming = (ticket: FeedTicket) =>
    ticket.eventAt !== null && ticket.eventAt.getTime() >= now;
  const bySoon = (a: FeedTicket, b: FeedTicket) => {
    const ua = upcoming(a);
    const ub = upcoming(b);
    if (ua !== ub) return ua ? -1 : 1;
    if (ua && ub) {
      // Both have an eventAt by construction of `upcoming`.
      return (a.eventAt as Date).getTime() - (b.eventAt as Date).getTime();
    }
    return 0;
  };

  /*
   * The ticks stack in the order the bar shows them: odds, then the author's
   * accuracy, then kickoff. Each later key only breaks the ties the earlier
   * ones leave. Community tickets have no record and sink below authored
   * ones under the accuracy key rather than pretending to a zero.
   */
  const keys: ((a: FeedTicket, b: FeedTicket) => number)[] = [];

  if (filter.odds) {
    const sign = filter.odds === 'high' ? -1 : 1;
    keys.push((a, b) => sign * (a.oddsMilli - b.oddsMilli));
  }

  if (filter.acc) {
    const sign = filter.acc === 'high' ? -1 : 1;
    keys.push((a, b) => {
      const ha = a.authorHitRateBps;
      const hb = b.authorHitRateBps;
      if ((ha === null) !== (hb === null)) return ha === null ? 1 : -1;
      if (ha === null || hb === null) return 0;
      return sign * (ha - hb);
    });
  }

  if (filter.soon === '1' || keys.length === 0) keys.push(bySoon);
  keys.push(publishedDesc);

  items.sort((a, b) => {
    for (const key of keys) {
      const order = key(a, b);
      if (order !== 0) return order;
    }
    return 0;
  });
}

/** The free feed: PUBLIC only, whoever posted it. */
export async function listFreeTickets(filter: TicketFilter) {
  return listTicketFeed('FREE', filter);
}

/** The paid feed: every PREMIUM/VIP bet. */
export async function listPaidTickets(filter: TicketFilter) {
  return listTicketFeed('PAID', filter);
}

export type PlanGrant = { tier: PlanTier; analystProfileId: string | null };

/**
 * The viewer's currently-active plan grants, fetched once per page rather than
 * once per ticket. Mirrors the subscription conditions in `canViewPrediction`
 * so a list and a detail page can never disagree about who is entitled.
 */
export async function activePlanGrants(
  userId: string | undefined,
): Promise<PlanGrant[]> {
  if (!userId) return [];

  const subscriptions = await prisma.userSubscription.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      plan: { isActive: true },
    },
    select: {
      plan: { select: { tier: true, analystProfileId: true } },
    },
  });

  return subscriptions.map((subscription) => subscription.plan);
}

export async function getTicketById(id: string) {
  return prisma.prediction.findFirst({
    where: { id, publishedAt: { not: null } },
    select: {
      ...publicTicketSelect,
      supersededAt: true,
      authorId: true,
      correctedBy: { select: { id: true, version: true } },
    },
  });
}

export async function listSports() {
  return prisma.sport.findMany({
    where: { isActive: true },
    orderBy: { nameKa: 'asc' },
    select: { id: true, code: true, nameKa: true, slug: true },
  });
}

export async function listAnalystOptions() {
  return prisma.analystProfile.findMany({
    where: { status: 'APPROVED' },
    orderBy: { displayName: 'asc' },
    select: { slug: true, displayName: true },
  });
}

/** Headline counters for the home page. */
export async function platformStats() {
  /*
   * Analyst bets only.
   *
   * Community free tickets have no author, count toward nobody's record, and
   * are not reviewed to the same standard. Folding them into the platform hit
   * rate would let anyone with an account move the headline accuracy figure,
   * which is the one number this product is judged on.
   */
  const BY_ANALYSTS = {
    publishedAt: { not: null },
    supersededAt: null,
    authorId: { not: null },
  } as const;

  const [analysts, published, settled, won] = await Promise.all([
    prisma.analystProfile.count({ where: { status: 'APPROVED' } }),
    prisma.prediction.count({ where: BY_ANALYSTS }),
    prisma.prediction.count({
      where: { ...BY_ANALYSTS, status: { in: ['WON', 'LOST'] } },
    }),
    prisma.prediction.count({ where: { ...BY_ANALYSTS, status: 'WON' } }),
  ]);

  return {
    analysts,
    published,
    settled,
    hitRateBps: settled === 0 ? 0 : Math.round((won * 10_000) / settled),
  };
}

/**
 * The ids of paid tickets this viewer has bought outright. Fetched once per
 * page and subtracted from the locked set, mirroring the purchase check in
 * `canViewPrediction` so a list and a detail page cannot disagree.
 */
export async function purchasedTicketIds(
  userId: string | undefined,
): Promise<Set<string>> {
  if (!userId) return new Set();

  const rows = await prisma.predictionPurchase.findMany({
    where: { userId, revokedAt: null },
    select: { predictionId: true },
  });
  return new Set(rows.map((row) => row.predictionId));
}
