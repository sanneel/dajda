import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
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

/**
 * The free feed.
 *
 * PUBLIC only, deliberately. Everything a subscriber pays for lives on the
 * author's own profile; this page is the part of the product that costs
 * nothing, so a paid bet must never leak into it through a filter.
 */
export async function listFreeTickets(filter: TicketFilter) {
  const where: Prisma.PredictionWhereInput = {
    publishedAt: { not: null },
    supersededAt: null,
    visibility: 'PUBLIC',
    ...(filter.sport ? { sport: { code: filter.sport } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };

  const page = filter.page ?? 1;

  const [items, total] = await Promise.all([
    prisma.prediction.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * TICKET_PAGE_SIZE,
      take: TICKET_PAGE_SIZE,
      select: publicTicketSelect,
    }),
    prisma.prediction.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / TICKET_PAGE_SIZE)),
  };
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
