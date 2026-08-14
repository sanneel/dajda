import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa } from '@/lib/format';
import { REPORT_REASON_KA, REPORT_STATUS_KA } from '@/lib/labels';
import { resolveReportAction } from '@/actions/admin';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { ActionButton } from '@/components/admin/action-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'საჩივრები · ადმინი',
  robots: { index: false, follow: false },
};

export default async function AdminReportsPage() {
  await requireAdmin();

  const reports = await prisma.report.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      targetType: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      resolutionNote: true,
      reporter: { select: { email: true } },
      analystProfile: { select: { displayName: true, slug: true } },
      prediction: { select: { id: true, titleKa: true } },
    },
  });

  const open = reports.filter((report) => report.status === 'OPEN');

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          საჩივრები
        </h1>
        <p className="mt-1.5 text-ink-muted">
          მომხმარებლების მიერ დაფიქსირებული პრობლემები. ღია: {open.length}.
        </p>
      </header>

      <Card>
        <CardHeader title={`სია (${reports.length})`} />
        <CardBody>
          {reports.length === 0 ? (
            <EmptyState title="საჩივარი არ არის" />
          ) : (
            <ul className="space-y-3">
              {reports.map((report) => (
                <li
                  key={report.id}
                  className="rounded border border-line bg-canvas p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            report.status === 'OPEN'
                              ? 'warn'
                              : report.status === 'RESOLVED'
                                ? 'accent'
                                : 'neutral'
                          }
                        >
                          {REPORT_STATUS_KA[report.status]}
                        </Badge>
                        <span className="text-sm font-medium text-ink">
                          {REPORT_REASON_KA[report.reason]}
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm text-ink-muted">
                        {report.targetType === 'ANALYST' &&
                        report.analystProfile ? (
                          <>
                            ავტორი:{' '}
                            <Link
                              href={`/analysts/${report.analystProfile.slug}`}
                              className="text-accent hover:underline"
                            >
                              {report.analystProfile.displayName}
                            </Link>
                          </>
                        ) : report.prediction ? (
                          <>
                            ფსონი:{' '}
                            <Link
                              href={`/free/${report.prediction.id}`}
                              className="text-accent hover:underline"
                            >
                              {report.prediction.titleKa}
                            </Link>
                          </>
                        ) : (
                          '·'
                        )}
                      </p>

                      {report.details ? (
                        <p className="mt-1.5 whitespace-pre-line text-sm text-ink-muted">
                          {report.details}
                        </p>
                      ) : null}

                      <p className="mt-1.5 text-xs text-ink-faint">
                        {report.reporter?.email ?? 'ანონიმური'} ·{' '}
                        {formatDateTimeKa(report.createdAt)}
                      </p>
                    </div>
                  </div>

                  {report.status !== 'RESOLVED' &&
                  report.status !== 'DISMISSED' ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <ActionButton
                        action={resolveReportAction}
                        fields={{ reportId: report.id, status: 'REVIEWING' }}
                        label="განხილვაში"
                      />
                      <ActionButton
                        action={resolveReportAction}
                        fields={{ reportId: report.id, status: 'RESOLVED' }}
                        label="დახურვა"
                        tone="accent"
                      />
                      <ActionButton
                        action={resolveReportAction}
                        fields={{ reportId: report.id, status: 'DISMISSED' }}
                        label="უარყოფა"
                        tone="danger"
                      />
                    </div>
                  ) : report.resolutionNote ? (
                    <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
                      {report.resolutionNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
