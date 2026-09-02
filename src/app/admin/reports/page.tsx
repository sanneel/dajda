import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/authorization';
import { formatDateTimeKa } from '@/lib/format';
import { REPORT_REASON_KA, REPORT_STATUS_KA } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { ReportDecisionForm } from './decide-form';

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
        <h1 className="font-display text-2xl text-ink sm:text-3xl">
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
                    <div className="mt-3 border-t border-line pt-3">
                      <ReportDecisionForm
                        reportId={report.id}
                        status={report.status}
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
