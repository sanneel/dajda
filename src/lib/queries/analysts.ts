import { prisma } from '@/lib/db';
import {
  sortAnalysts,
  type AnalystListItem,
  type AnalystSort,
} from '@/lib/stats/ranking';
import {
  isLowSample,
  rankingScore,
  summarizePerformance,
  withinDays,
  type PerformanceRecord,
} from '@/lib/stats/performance';

export { sortAnalysts };
export type { AnalystListItem, AnalystSort };

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
}): Promise<AnalystListItem[]> {
  const profiles = await prisma.analystProfile.findMany({
    where: {
      status: 'APPROVED',
      ...(options?.sportCode
        ? { sports: { some: { sport: { code: options.sportCode } } } }
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

  const items: AnalystListItem[] = profiles.map((profile) => {
    const records = toRecords(byAuthor.get(profile.id) ?? []);
    const allTime = summarizePerformance(records);
    const last30Days = summarizePerformance(withinDays(records, 30));

    return {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline,
      isDemo: profile.isDemo,
      sports: profile.sports.map((entry) => entry.sport),
      allTime,
      last30Days,
      lowSample: isLowSample(allTime),
      score: rankingScore(allTime),
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

  return sortAnalysts(items, options?.sort ?? 'score');
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
      oddsMilli: true,
      stakeUnitsCenti: true,
      confidence: true,
      publishedAt: true,
      eventAt: true,
      finishedAt: true,
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

/** Top performers for the home page. */
export async function topAnalysts(limit = 4): Promise<AnalystListItem[]> {
  const all = await listAnalysts({ sort: 'score' });
  // Never surface an analyst whose record is too short to mean anything.
  const eligible = all.filter((analyst) => !analyst.lowSample);
  return (eligible.length > 0 ? eligible : all).slice(0, limit);
}
