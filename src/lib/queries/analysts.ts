import { prisma } from '@/lib/db';
import {
  PERIOD_DAYS,
  sortAnalysts,
  type AnalystListItem,
  type AnalystPeriod,
  type AnalystSort,
} from '@/lib/stats/ranking';
import {
  isLowSample,
  summarizePerformance,
  withinDays,
  type PerformanceRecord,
} from '@/lib/stats/performance';

export { sortAnalysts, PERIOD_DAYS };
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


function toRecords(
  rows: {
    status: PerformanceRecord['status'];
    oddsMilli: number;
    stakeUnitsCenti: number;
    publishedAt: Date | null;
    result: { profitUnitsCenti: number } | null;
  }[],
): PerformanceRecord[] {
  return rows.map((row) => ({
    status: row.status,
    oddsMilli: row.oddsMilli,
    stakeUnitsCenti: row.stakeUnitsCenti,
    profitUnitsCenti: row.result?.profitUnitsCenti ?? null,
    // PUBLISHED guarantees a non-null publishedAt.
    publishedAt: row.publishedAt as Date,
  }));
}

export async function listAnalysts(options?: {
  sportCode?: string;
  sort?: AnalystSort;
  /** How far back the displayed record reaches. Default: all time. */
  period?: AnalystPeriod;
  /** Case-insensitive name search, from the list's search box. */
  query?: string;
}): Promise<AnalystListItem[]> {
  const profiles = await prisma.analystProfile.findMany({
    where: {
      status: 'APPROVED',
      ...(options?.sportCode
        ? { sports: { some: { sport: { code: options.sportCode } } } }
        : {}),
      ...(options?.query?.trim()
        ? {
            displayName: {
              contains: options.query.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      headline: true,
      isDemo: true,
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

  // One query for every analyst's record, grouped in memory - avoids N+1.
  const predictions = await prisma.prediction.findMany({
    where: { authorId: { in: profiles.map((p) => p.id) }, ...PUBLISHED },
    select: {
      authorId: true,
      status: true,
      oddsMilli: true,
      stakeUnitsCenti: true,
      publishedAt: true,
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

  const period = options?.period ?? 'all';
  const periodDays = period === 'all' ? null : PERIOD_DAYS[period];
  const now = Date.now();

  const items: AnalystListItem[] = profiles.map((profile) => {
    const allRecords = toRecords(byAuthor.get(profile.id) ?? []);
    const records =
      periodDays === null ? allRecords : withinDays(allRecords, periodDays);
    const stats = summarizePerformance(records);

    /*
     * Tickets per week over the selected period. With no period selected the
     * denominator runs from the analyst's first published bet, so a veteran
     * and a newcomer are both measured against their own active span.
     */
    const firstAt = allRecords.length
      ? Math.min(...allRecords.map((record) => record.publishedAt.getTime()))
      : now;
    const spanDays =
      periodDays ?? Math.max(7, (now - firstAt) / (24 * 60 * 60 * 1000));
    const avgPerWeek = stats.total / (spanDays / 7);

    return {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline,
      isDemo: profile.isDemo,
      sports: profile.sports.map((entry) => entry.sport),
      stats,
      avgPerWeek,
      lowSample: isLowSample(stats),
      /*
       * "Active tips": published, not yet finished by the author and not yet
       * settled. It is what a buyer is actually getting access to right now,
       * which is why the reference layout puts it next to the name.
       */
      activeBets: (byAuthor.get(profile.id) ?? []).filter(
        (bet) => bet.status === 'PENDING' && bet.finishedAt === null,
      ).length,
      cheapestPlan: profile.plans[0] ?? null,
    };
  });

  return sortAnalysts(items, options?.sort ?? 'profit');
}


export type AnalystProfileDetail = NonNullable<
  Awaited<ReturnType<typeof getAnalystBySlug>>
>;

export async function getAnalystBySlug(slug: string) {
  const profile = await prisma.analystProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      displayName: true,
      headline: true,
      bio: true,
      status: true,
      isDemo: true,
      createdAt: true,
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
  });

  if (!profile || profile.status !== 'APPROVED') return null;

  const predictions = await prisma.prediction.findMany({
    where: { authorId: profile.id, ...PUBLISHED },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      titleKa: true,
      descriptionKa: true,
      screenshotPath: true,
      resultScreenshotPath: true,
      status: true,
      visibility: true,
      // The per-ticket price, for the history list's ფასიანი column.
      priceMinor: true,
      oddsMilli: true,
      stakeUnitsCenti: true,
      confidence: true,
      publishedAt: true,
      eventAt: true,
      eventEndAt: true,
      finishedAt: true,
      // A superseded row is a corrected draft, not part of the record.
      supersededAt: true,
      pinnedAt: true,
      version: true,
      correctionOfId: true,
      sport: { select: { code: true, nameKa: true } },
      result: {
        select: { profitUnitsCenti: true, settledAt: true, settlementSource: true },
      },
    },
  });

  const records = toRecords(predictions);

  return {
    profile,
    predictions,
    allTime: summarizePerformance(records),
    last30Days: summarizePerformance(withinDays(records, 30)),
    /*
     * The same record cut the way a buyer reads it: what the free tickets
     * returned versus what the subscription ones did. Derived from the same
     * rows as `allTime`, so the three figures can never disagree.
     */
    freeAllTime: summarizePerformance(
      toRecords(predictions.filter((p) => p.visibility === 'PUBLIC')),
    ),
    paidAllTime: summarizePerformance(
      toRecords(predictions.filter((p) => p.visibility !== 'PUBLIC')),
    ),
    records,
  };
}

