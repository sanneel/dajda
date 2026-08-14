import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'შეტყობინებები · ადმინი',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

const STATUS_KA: Record<string, string> = {
  PENDING: 'რიგში',
  SENT: 'გაგზავნილი',
  FAILED: 'ჩავარდა',
  SKIPPED: 'გამოტოვებული',
};

/**
 * The notification outbox.
 *
 * Nothing on this page sends anything, and there is deliberately no button
 * that would. It is a record of what the product decided to tell people and
 * where it intended to tell them, so that when a mail or Telegram sender is
 * configured, the backlog is visible rather than discovered.
 *
 * SKIPPED is shown alongside PENDING rather than hidden: "we had no address
 * for this person" is a different fact from a delivery failure, and it is the
 * one an admin can actually act on.
 */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const statusParam =
    typeof params.status === 'string' ? params.status : undefined;
  const status = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'].find(
    (value) => value === statusParam,
  ) as 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | undefined;

  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const where: Prisma.NotificationWhereInput = status ? { status } : {};

  const [total, rows, byStatus] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        channel: true,
        status: true,
        destination: true,
        subjectKa: true,
        bodyKa: true,
        linkPath: true,
        failureReason: true,
        createdAt: true,
        sentAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.notification.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts = new Map(byStatus.map((row) => [row.status, row._count._all]));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (patch: { status?: string; page?: string }) => {
    const next = new URLSearchParams();
    const merged = { status, page: String(page), ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === 'page' && value === '1')) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/notifications?${query}` : '/admin/notifications';
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          შეტყობინებები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          რიგი: ვის რა უნდა მისულიყო და რომელ არხზე.
        </p>
      </header>

      <div className="mb-5">
        <Alert tone="warning" title="გაგზავნა ჯერ არ არის ჩართული">
          არც ერთი შეტყობინება არ იგზავნება. ჩანაწერები გროვდება, რომ SMTP-ისა
          და Telegram-ის ბოტის დაყენების შემდეგ არაფერი დაიკარგოს.
        </Alert>
      </div>

      <nav
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3 text-sm"
        aria-label="სტატუსის ფილტრი"
      >
        <Link
          href="/admin/notifications"
          className={status ? 'text-ink-muted hover:text-ink' : 'text-accent'}
        >
          ყველა <span className="tabular">({total})</span>
        </Link>
        {(['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const).map((value) => (
          <Link
            key={value}
            href={hrefFor({ status: value, page: '1' })}
            className={
              status === value ? 'text-accent' : 'text-ink-muted hover:text-ink'
            }
          >
            {STATUS_KA[value]}{' '}
            <span className="tabular">({counts.get(value) ?? 0})</span>
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader
          title="ჩანაწერები"
          level={2}
          description={`გვერდი ${page} / ${pageCount}`}
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState title="ამ ფილტრით ჩანაწერი არ არის" />
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-card border border-line bg-canvas p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{row.channel}</Badge>
                    <Badge tone={row.status === 'FAILED' ? 'loss' : 'neutral'}>
                      {STATUS_KA[row.status] ?? row.status}
                    </Badge>
                    <span className="tabular text-xs text-ink-faint">
                      {formatDateTimeKa(row.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1.5 font-medium text-ink">{row.subjectKa}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">
                    {row.bodyKa}
                  </p>

                  <p className="mt-1.5 text-xs text-ink-faint">
                    {row.user.name} · {row.user.email}
                    {row.destination ? ` · → ${row.destination}` : ''}
                    {row.linkPath ? ` · ${row.linkPath}` : ''}
                  </p>

                  {row.failureReason ? (
                    <p className="mt-1 text-xs text-loss">
                      {row.failureReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 ? (
            <nav
              className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4 text-sm"
              aria-label="გვერდები"
            >
              {page > 1 ? (
                <Link
                  href={hrefFor({ page: String(page - 1) })}
                  className="text-ink hover:text-accent"
                >
                  წინა
                </Link>
              ) : (
                <span className="text-ink-faint">წინა</span>
              )}
              <span className="tabular text-ink-muted">
                {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={hrefFor({ page: String(page + 1) })}
                  className="text-ink hover:text-accent"
                >
                  შემდეგი
                </Link>
              ) : (
                <span className="text-ink-faint">შემდეგი</span>
              )}
            </nav>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
