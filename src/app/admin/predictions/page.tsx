import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa, formatOdds, formatUnitsSigned } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { SettleForm } from './settle-form';
import { PredictionFilters } from './filters';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ფსონები · ადმინი',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

const STATUSES = ['PENDING', 'WON', 'LOST', 'VOID', 'PUSH'] as const;

/**
 * Bet administration.
 *
 * The job here is reviewing screenshots. An author posts a slip, later marks
 * it finished and usually attaches a result screenshot; an admin looks at both
 * and records the outcome. Bets with no result screenshot still appear in the
 * queue, because a missing image should slow review down, not let a bet sit
 * unsettled forever.
 *
 * It is a browser over EVERY bet rather than a fixed queue, so an admin can
 * also look one up afterwards and see who settled it and against what.
 */
export default async function AdminPredictionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const str = (key: string) =>
    typeof params[key] === 'string' && params[key] ? params[key] : undefined;

  const analystId = str('analyst');
  const sportId = str('sport');
  const q = str('q');
  const statusParam = str('status');
  const reviewParam = str('review');

  // Only accept values the enum actually contains, so a hand-edited query
  // string cannot reach Prisma as an invalid filter.
  const status = STATUSES.find((s) => s === statusParam);
  // "review" is not a column: it is the author-finished, admin-unsettled state.
  const onlyAwaitingReview = reviewParam === 'awaiting';

  const page = Math.max(1, Number(str('page') ?? '1') || 1);

  const where: Prisma.PredictionWhereInput = {
    ...(analystId ? { authorId: analystId } : {}),
    ...(sportId ? { sportId } : {}),
    ...(status ? { status } : {}),
    ...(onlyAwaitingReview
      ? { finishedAt: { not: null }, status: 'PENDING' as const }
      : {}),
    ...(q ? { titleKa: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [analysts, sports, total, predictions, awaitingCount] =
    await Promise.all([
      prisma.analystProfile.findMany({
        where: { status: 'APPROVED' },
        orderBy: { displayName: 'asc' },
        select: { id: true, displayName: true },
      }),
      prisma.sport.findMany({
        orderBy: { nameKa: 'asc' },
        select: { id: true, nameKa: true },
      }),
      prisma.prediction.count({ where }),
      prisma.prediction.findMany({
        where,
        // Bets waiting on an admin come first: that is the work.
        orderBy: [{ finishedAt: 'asc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          titleKa: true,
          screenshotPath: true,
          resultScreenshotPath: true,
          oddsMilli: true,
          status: true,
          visibility: true,
          version: true,
          publishedAt: true,
          eventAt: true,
          finishedAt: true,
          supersededAt: true,
          sport: { select: { nameKa: true } },
          author: { select: { displayName: true, slug: true } },
          result: {
            select: {
              profitUnitsCenti: true,
              settledAt: true,
              settlementSource: true,
              settledBy: { select: { email: true } },
            },
          },
        },
      }),
      prisma.prediction.count({
        where: { finishedAt: { not: null }, status: 'PENDING' },
      }),
    ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q,
      analyst: analystId,
      sport: sportId,
      status,
      review: onlyAwaitingReview ? 'awaiting' : undefined,
      page: String(page),
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === 'page' && value === '1')) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/predictions?${query}` : '/admin/predictions';
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">ფსონები</h1>
        <p className="mt-1.5 text-ink-muted">
          სკრინშოტების განხილვა და შედეგის დაფიქსირება.
        </p>
      </header>

      {awaitingCount > 0 && !onlyAwaitingReview ? (
        <div className="mb-5">
          <Alert tone="warning" title="ელოდება განხილვას">
            <span className="tabular">{awaitingCount}</span> ფსონი ავტორმა
            დაასრულა და შედეგს ელოდება.{' '}
            <Link
              href={hrefWith({ review: 'awaiting', page: '1' })}
              className="text-accent underline"
            >
              ნახვა
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="mb-5">
        <PredictionFilters
          analysts={analysts.map((a) => ({ value: a.id, label: a.displayName }))}
          sports={sports.map((s) => ({ value: s.id, label: s.nameKa }))}
          current={{
            analyst: analystId,
            status,
            sport: sportId,
            review: onlyAwaitingReview ? 'awaiting' : undefined,
            q,
          }}
          total={total}
        />
      </div>

      <Card>
        <CardHeader
          title="ჩანაწერები"
          level={2}
          description={`გვერდი ${page} / ${pageCount}`}
        />
        <CardBody>
          {predictions.length === 0 ? (
            <EmptyState
              title="ამ ფილტრით ჩანაწერი ვერ მოიძებნა"
              description="შეცვალეთ ფილტრი ან გაასუფთავეთ."
            />
          ) : (
            <ul className="space-y-4">
              {predictions.map((prediction) => {
                const awaiting =
                  prediction.finishedAt !== null &&
                  prediction.status === 'PENDING' &&
                  prediction.supersededAt === null;

                return (
                  <li
                    key={prediction.id}
                    className={`rounded-card border bg-canvas p-4 ${
                      awaiting ? 'border-line-strong' : 'border-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/free/${prediction.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {prediction.titleKa}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {/* No author: a community free ticket. */}
                          {prediction.author ? (
                            <Link
                              href={`/analysts/${prediction.author.slug}`}
                              className="hover:text-ink"
                            >
                              {prediction.author.displayName}
                            </Link>
                          ) : (
                            <span>უფასო პროგნოზი</span>
                          )}
                          {' · '}
                          {prediction.sport.nameKa}
                          {' · კოეფ. '}
                          <span className="tabular">
                            {formatOdds(prediction.oddsMilli)}
                          </span>
                          {prediction.eventAt ? (
                            <>
                              {' · '}
                              <span className="tabular">
                                {formatDateTimeKa(prediction.eventAt)}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {prediction.visibility === 'PUBLIC' ? (
                          <Badge tone="accent">უფასო</Badge>
                        ) : null}
                        {prediction.publishedAt === null ? (
                          <Badge>მონახაზი</Badge>
                        ) : null}
                        {prediction.supersededAt !== null ? (
                          <Badge tone="warn">შეცვლილია</Badge>
                        ) : null}
                        {prediction.version > 1 ? (
                          <Badge>v{prediction.version}</Badge>
                        ) : null}
                        {awaiting ? (
                          <Badge tone="warn">ელოდება განხილვას</Badge>
                        ) : null}
                        <StatusBadge status={prediction.status} />
                      </div>
                    </div>

                    {/*
                     * Both screenshots side by side, which is the whole point
                     * of the queue: the slip as posted, and the author's proof
                     * that it landed. When the second is missing the gap says
                     * so, rather than the row looking complete.
                     */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <figure>
                        <figcaption className="rule-label mb-1.5">
                          ფსონი
                        </figcaption>
                        <a
                          href={prediction.screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="relative block aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface"
                        >
                          <Image
                            src={prediction.screenshotPath}
                            alt={`ფსონის სკრინშოტი: ${prediction.titleKa}`}
                            fill
                            sizes="(min-width: 640px) 20rem, 90vw"
                            className="object-contain"
                          />
                        </a>
                      </figure>

                      <figure>
                        <figcaption className="rule-label mb-1.5">
                          შედეგი
                        </figcaption>
                        {prediction.resultScreenshotPath ? (
                          <a
                            href={prediction.resultScreenshotPath}
                            target="_blank"
                            rel="noreferrer"
                            className="relative block aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface"
                          >
                            <Image
                              src={prediction.resultScreenshotPath}
                              alt="შედეგის სკრინშოტი"
                              fill
                              sizes="(min-width: 640px) 20rem, 90vw"
                              className="object-contain"
                            />
                          </a>
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center rounded-card border border-dashed border-line-strong bg-surface px-4 text-center text-sm text-ink-faint">
                            ავტორს შედეგის სკრინშოტი არ აუტვირთავს. შეამოწმეთ
                            ხელით.
                          </div>
                        )}
                      </figure>
                    </div>

                    {prediction.finishedAt && prediction.status === 'PENDING' ? (
                      <p className="mt-2.5 text-xs text-ink-muted">
                        ავტორმა დაასრულა{' '}
                        <span className="tabular">
                          {formatDateTimeKa(prediction.finishedAt)}
                        </span>
                      </p>
                    ) : null}

                    {/*
                     * A settled bet shows its provenance. Without the source
                     * and the person, "დაჯდა" is just an assertion, which is
                     * the opposite of what this product sells.
                     */}
                    {prediction.result ? (
                      <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-ink-muted">
                        დაფიქსირდა{' '}
                        <span className="tabular">
                          {formatDateTimeKa(prediction.result.settledAt)}
                        </span>
                        {' · '}
                        <span
                          className={`tabular ${
                            prediction.result.profitUnitsCenti < 0
                              ? 'text-loss'
                              : 'text-ink'
                          }`}
                        >
                          {formatUnitsSigned(prediction.result.profitUnitsCenti)}
                        </span>
                        {' · წყარო: '}
                        <span className="text-ink">
                          {prediction.result.settlementSource}
                        </span>
                        {prediction.result.settledBy
                          ? ` · ${prediction.result.settledBy.email}`
                          : ''}
                      </p>
                    ) : null}

                    {prediction.publishedAt !== null &&
                    prediction.status === 'PENDING' &&
                    prediction.supersededAt === null ? (
                      <div className="mt-3">
                        <SettleForm predictionId={prediction.id} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {pageCount > 1 ? (
            <nav
              className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4"
              aria-label="გვერდები"
            >
              {page > 1 ? (
                <Link
                  href={hrefWith({ page: String(page - 1) })}
                  className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
                >
                  წინა
                </Link>
              ) : (
                <span />
              )}

              <span className="tabular text-sm text-ink-muted">
                {page} / {pageCount}
              </span>

              {page < pageCount ? (
                <Link
                  href={hrefWith({ page: String(page + 1) })}
                  className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
                >
                  შემდეგი
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
