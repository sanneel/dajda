import { cache } from 'react';
import { unstable_cache, updateTag } from 'next/cache';
import { isTicketStillActive } from '@/lib/tickets/active';
import { countsInRecord } from '@/lib/predictions/kickoff';
import { prisma } from '@/lib/db';
import {
  PERIOD_DAYS,
  sortAnalysts,
  type AnalystListItem,
  type AnalystPeriod,
  type AnalystSort,
} from '@/lib/stats/ranking';
import {
  monthlyPerformance,
  oddsBucketPerformance,
  summarizePerformance,
  withinDays,
  type PerformanceRecord,
} from '@/lib/stats/performance';

export type { AnalystListItem, AnalystPeriod, AnalystSort };

/**
 * Read models for analyst listing and profile pages.
 *
 * Performance is always derived from the prediction rows rather than stored as
 * a denormalised counter - a cached "wins" column can drift from the evidence,
 * and the whole proposition here is that the numbers can be checked.
 *
 * Superseded (corrected) versions are excluded everywhere so a correction
 * cannot be counted twice.
 */

const PUBLISHED = {
  publishedAt: { not: null },
  supersededAt: null,
} as const;


/**
 * The rows that count, as performance records.
 *
 * A ticket published after its first match started stays on the page, since
 * a record never loses a row, but it does not count (terms §8.1). The
 * service refuses such a publication now; this covers rows from before it did.
 */
function toRecords(
  rows: {
    status: PerformanceRecord['status'];
    oddsMilli: number;
    stakeUnitsCenti: number;
    publishedAt: Date | null;
    eventAt: Date | null;
    result: { profitUnitsCenti: number } | null;
  }[],
): PerformanceRecord[] {
  return rows.filter(countsInRecord).map((row) => ({
    status: row.status,
    oddsMilli: row.oddsMilli,
    stakeUnitsCenti: row.stakeUnitsCenti,
    profitUnitsCenti: row.result?.profitUnitsCenti ?? null,
    // PUBLISHED guarantees a non-null publishedAt.
    publishedAt: row.publishedAt as Date,
  }));
}

/** The tag on every cached analyst read. See refreshAnalysts. */
const ANALYSTS_TAG = 'analysts';

/**
 * The ranking is the most expensive read on the site: every subscription
 * ticket every listed author has published, summarised in memory. It ran on
 * every visit to the home page, so its cost grew with the whole history.
 *
 * It is now built once per period and shared across requests. The name
 * search, the sport filter and the sort run per request on the cached rows,
 * so four entries cover every combination a reader can pick.
 *
 * A write that changes what the list shows expires it through
 * refreshAnalysts. The 60 second lifetime covers what changes with the
 * clock alone: a period window sliding forward, a ticket whose event has
 * started dropping out of the active count.
 */
const rankedAnalysts = unstable_cache(buildAnalystList, ['analyst-list'], {
  tags: [ANALYSTS_TAG],
  revalidate: 60,
});

/**
 * Expire the cached ranking and every cached profile record. Call it from
 * every Server Action that changes an author's status, name, photo, plans,
 * or published tickets.
 */
export function refreshAnalysts(): void {
  updateTag(ANALYSTS_TAG);
}

export async function listAnalysts(options?: {
  sportCode?: string;
  sort?: AnalystSort;
  /** How far back the displayed record reaches. Default: all time. */
  period?: AnalystPeriod;
  /** Case-insensitive name search, from the list's search box. */
  query?: string;
}): Promise<AnalystListItem[]> {
  const sportCode = options?.sportCode;
  const query = options?.query?.trim().toLowerCase();

  const items = (await rankedAnalysts(options?.period ?? 'all')).filter(
    (item) =>
      (!sportCode || item.sports.some((sport) => sport.code === sportCode)) &&
      (!query || item.displayName.toLowerCase().includes(query)),
  );

  return sortAnalysts(items, options?.sort ?? 'profit');
}

async function buildAnalystList(
  period: AnalystPeriod,
): Promise<AnalystListItem[]> {
  /*
   * The analyst list is a list of SUBSCRIPTIONS for sale, so it is built from
   * subscription tickets alone, decided 2026-09-11.
   *
   * An author who has never published a subscription ticket has nothing on
   * offer here and does not appear, however many free or single tickets they
   * post: those are reached through the free and paid feeds. And the record
   * printed on each row is the subscription record, because that is the
   * product the row's button sells. A row mixing in free tips would advertise
   * a hit rate the subscriber is not buying.
   */
  const profiles = await prisma.analystProfile.findMany({
    where: {
      status: 'APPROVED',
      predictions: { some: { visibility: 'VIP', ...PUBLISHED } },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      photoPath: true,
      headline: true,
      isDemo: true,
      monthlyMinimum: true,
      createdAt: true,
      sports: { select: { sport: { select: { code: true, nameKa: true } } } },
      plans: {
        where: { isActive: true },
        orderBy: { priceMinor: 'asc' },
        take: 1,
        select: {
          id: true,
          priceMinor: true,
          currency: true,
          billingPeriod: true,
        },
      },
    },
  });

  if (profiles.length === 0) return [];

  // One query for every analyst's subscription record, grouped in memory -
  // avoids N+1. Stats, weekly volume and active count all read from this.
  const predictions = await prisma.prediction.findMany({
    where: {
      authorId: { in: profiles.map((p) => p.id) },
      visibility: 'VIP',
      ...PUBLISHED,
    },
    select: {
      authorId: true,
      status: true,
      oddsMilli: true,
      stakeUnitsCenti: true,
      publishedAt: true,
      eventAt: true,
      finishedAt: true,
      result: { select: { profitUnitsCenti: true } },
    },
  });

  const byAuthor = new Map<string, typeof predictions>();
  for (const prediction of predictions) {
    // The query filters on `authorId in [...]`, so this can never be null.
    // The guard is here to satisfy the nullable column, not to skip rows.
    if (prediction.authorId === null) continue;
    const bucket = byAuthor.get(prediction.authorId) ?? [];
    bucket.push(prediction);
    byAuthor.set(prediction.authorId, bucket);
  }

  const periodDays = period === 'all' ? null : PERIOD_DAYS[period];
  const now = Date.now();
  const nowDate = new Date(now);

  const items: AnalystListItem[] = profiles.map((profile) => {
    const bets = byAuthor.get(profile.id) ?? [];
    const allRecords = toRecords(bets);
    const records =
      periodDays === null ? allRecords : withinDays(allRecords, periodDays);
    const stats = summarizePerformance(records);

    /*
     * Tickets per week over the selected period. With no period selected the
     * denominator runs from the analyst's first published bet, so a veteran
     * and a newcomer are both measured against their own active span.
     */
    const firstAt = allRecords.reduce(
      (earliest, record) => Math.min(earliest, record.publishedAt.getTime()),
      now,
    );
    const spanDays =
      periodDays ?? Math.max(7, (now - firstAt) / (24 * 60 * 60 * 1000));
    const avgPerWeek = stats.total / (spanDays / 7);

    return {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName,
      photoPath: profile.photoPath,
      headline: profile.headline,
      isDemo: profile.isDemo,
      sports: profile.sports.map((entry) => entry.sport),
      stats,
      avgPerWeek,
      /* Clause 6.4: the floor this author committed to, shown before purchase. */
      monthlyMinimum: profile.monthlyMinimum,
      /*
       * "Active tips": published, not yet finished by the author, not yet
       * settled, and with the first position still to start. A list has no
       * viewer, so it uses the public rule of isTicketStillActive. It is what a buyer is actually getting access to right now,
       * which is why the reference layout puts it next to the name.
       */
      activeBets: bets.filter(
        (bet) =>
          bet.status === 'PENDING' &&
          bet.finishedAt === null &&
          isTicketStillActive(
            { eventAt: bet.eventAt, eventEndAt: null },
            false,
            nowDate,
          ),
      ).length,
      cheapestPlan: profile.plans[0] ?? null,
    };
  });

  return items;
}


/**
 * An analyst's public page, split by what each part costs.
 *
 * The record (totals and charts for each of the three products) is built from
 * every ticket the author has published, so it grows with their history. It
 * changes only when something is written, so it is cached per author and
 * expired through refreshAnalysts, like the ranking.
 *
 * What depends on the viewer or on the clock stays per request and reads
 * only what it needs: the open tickets (listOpenTickets) and this month's
 * count (countPublishedBetween).
 *
 * The slug is resolved outside the cache, so a made-up slug costs one
 * indexed lookup and never adds a cache entry. Memoized per request: the
 * page's metadata and body both read it.
 */
export const getAnalystPage = cache(async (slug: string) => {
  const found = await prisma.analystProfile.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!found || found.status !== 'APPROVED') return null;

  return analystRecord(found.id);
});

const analystRecord = unstable_cache(buildAnalystRecord, ['analyst-record'], {
  tags: [ANALYSTS_TAG],
  revalidate: 60,
});

async function buildAnalystRecord(profileId: string) {
  const [profile, predictions] = await Promise.all([
    prisma.analystProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        slug: true,
        displayName: true,
        photoPath: true,
        headline: true,
        isDemo: true,
        monthlyMinimum: true,
        sports: { select: { sport: { select: { code: true, nameKa: true } } } },
        plans: {
          where: { isActive: true },
          orderBy: { priceMinor: 'asc' },
          select: {
            id: true,
            tier: true,
            nameKa: true,
            descriptionKa: true,
            featuresKa: true,
            priceMinor: true,
            currency: true,
            billingPeriod: true,
          },
        },
      },
    }),
    prisma.prediction.findMany({
      where: { authorId: profileId, ...PUBLISHED },
      select: {
        visibility: true,
        status: true,
        oddsMilli: true,
        stakeUnitsCenti: true,
        publishedAt: true,
        eventAt: true,
        result: { select: { profitUnitsCenti: true } },
      },
    }),
  ]);

  if (!profile) return null;

  /*
   * One slice per product. A singly-sold ticket and a subscription ticket
   * are two different sales, so folding them into one "paid" figure
   * answered neither question. Each slice's charts come from the same rows
   * as its totals, so a number and its picture can never disagree.
   */
  const slice = (visibility: (typeof predictions)[number]['visibility']) => {
    const records = toRecords(
      predictions.filter((prediction) => prediction.visibility === visibility),
    );
    return {
      summary: summarizePerformance(records),
      charts: {
        monthly: monthlyPerformance(records),
        oddsBuckets: oddsBucketPerformance(records),
      },
    };
  };

  return {
    profile,
    free: slice('PUBLIC'),
    paid: slice('PREMIUM'),
    subscription: slice('VIP'),
  };
}

/**
 * The author's published tickets that are still unsettled: the page's
 * "active tickets" list. Per request, because whether a ticket is still
 * active depends on the clock and whether its pick shows depends on the
 * viewer. Only PENDING rows, so it stays small however long the history.
 */
export function listOpenTickets(authorId: string) {
  return prisma.prediction.findMany({
    where: { authorId, status: 'PENDING', ...PUBLISHED },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      titleKa: true,
      visibility: true,
      priceMinor: true,
      oddsMilli: true,
      status: true,
      publishedAt: true,
      eventAt: true,
      eventEndAt: true,
      sport: { select: { nameKa: true } },
    },
  });
}

/** Tickets the author published in [start, end), a correction counted once. */
export function countPublishedBetween(
  authorId: string,
  start: Date,
  end: Date,
): Promise<number> {
  return prisma.prediction.count({
    where: {
      authorId,
      supersededAt: null,
      publishedAt: { gte: start, lt: end },
    },
  });
}

/**
 * The full published record, for the public profile API, which returns
 * every ticket. The profile page reads getAnalystPage instead.
 */
export async function getAnalystBySlug(slug: string) {
  const [profile, predictions] = await Promise.all([
    prisma.analystProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        displayName: true,
        headline: true,
        status: true,
        isDemo: true,
        sports: { select: { sport: { select: { code: true } } } },
        plans: {
          where: { isActive: true },
          orderBy: { priceMinor: 'asc' },
          select: {
            id: true,
            tier: true,
            nameKa: true,
            priceMinor: true,
            currency: true,
            billingPeriod: true,
          },
        },
      },
    }),
    prisma.prediction.findMany({
      where: { author: { slug, status: 'APPROVED' }, ...PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        titleKa: true,
        screenshotPath: true,
        status: true,
        visibility: true,
        oddsMilli: true,
        stakeUnitsCenti: true,
        publishedAt: true,
        eventAt: true,
        sport: { select: { code: true } },
        result: { select: { profitUnitsCenti: true } },
      },
    }),
  ]);

  if (!profile || profile.status !== 'APPROVED') return null;

  const records = toRecords(predictions);

  return {
    profile,
    predictions,
    allTime: summarizePerformance(records),
    last30Days: summarizePerformance(withinDays(records, 30)),
    records,
  };
}
