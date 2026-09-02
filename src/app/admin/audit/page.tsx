import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa } from '@/lib/format';
import { USER_ROLE_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'აუდიტის ჟურნალი · ადმინი',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 60;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const entityType =
    typeof params.entity === 'string' && params.entity ? params.entity : undefined;

  const [entries, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['entityType'],
      _count: { _all: true },
      orderBy: { entityType: 'asc' },
    }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
          აუდიტის ჟურნალი
        </h1>
        <p className="mt-1.5 text-ink-muted">
          ბოლო {PAGE_SIZE} ჩანაწერი. ჟურნალი მხოლოდ ივსება: ჩანაწერის წაშლა ან
          რედაქტირება ინტერფეისიდან შეუძლებელია.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/admin/audit"
          aria-current={!entityType ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors ${
            !entityType
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          ყველა
        </a>
        {entityTypes.map((entry) => (
          <a
            key={entry.entityType}
            href={`/admin/audit?entity=${encodeURIComponent(entry.entityType)}`}
            aria-current={entityType === entry.entityType ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors ${
              entityType === entry.entityType
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {entry.entityType}
            <span className="tabular ml-1.5 text-xs text-ink-faint">
              {entry._count._all}
            </span>
          </a>
        ))}
      </div>

      <Card>
        <CardHeader title={`ჩანაწერები (${entries.length})`} />
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState title="ჩანაწერი არ არის" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <caption className="sr-only">აუდიტის ჩანაწერები</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      დრო
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      მოქმედება
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      აღწერა
                    </th>
                    <th scope="col" className="pb-2 font-medium text-ink-muted">
                      შემსრულებელი
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="py-2.5 text-xs text-ink-muted">
                        {formatDateTimeKa(entry.createdAt)}
                      </td>
                      <td className="py-2.5">
                        <Badge>{entry.action}</Badge>
                      </td>
                      <td className="py-2.5 text-ink">
                        {entry.summary}
                        <div className="text-xs text-ink-faint">
                          {entry.entityType}
                          {entry.entityId
                            ? ` · ${entry.entityId.slice(0, 8)}…`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 text-xs text-ink-muted">
                        {entry.actor?.email ?? 'სისტემა'}
                        {entry.actorRole ? (
                          <div className="text-ink-faint">
                            {USER_ROLE_KA[entry.actorRole]}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
