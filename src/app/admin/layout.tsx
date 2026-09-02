import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import { Logo } from '@/components/brand/logo';
import { LogoutButton } from '@/components/logout-button';
import { AdminNav } from './nav';

/**
 * The admin shell: a top bar, four sections, full-width content.
 *
 * It used to be a sixteen-rem sidebar with nine destinations and a content
 * column beside it. The sidebar cost a fifth of every screen to list tables,
 * and on a phone it stacked nine links above the page. Now the sections run
 * across the top, the queue count sits on the first one, and the page gets
 * the whole width - which the settlement queue, two screenshots side by side,
 * actually needs.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Authoritative check. The proxy layer performs no access control at all.
  const actor = await getCurrentUser();
  if (!actor) redirect('/login');
  if (actor.role !== 'ADMIN') redirect('/dashboard');

  /*
   * What is waiting on a person, summed for the nav. Four cheap counts on
   * every admin request is the price of the number being right everywhere
   * rather than only on the page that computes it.
   */
  const [awaitingBets, applications, payouts, reports] = await Promise.all([
    prisma.prediction.count({
      where: { finishedAt: { not: null }, status: 'PENDING', supersededAt: null },
    }),
    prisma.analystProfile.count({ where: { status: 'PENDING' } }),
    prisma.analystPayout.count({ where: { status: 'REQUESTED' } }),
    prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
  ]);
  const queueCount = awaitingBets + applications + payouts + reports;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-page items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="DAJDA: მთავარი გვერდი">
            <Logo size={22} />
          </Link>
          <span className="rounded border border-accent/35 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            ადმინი
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">
              {actor.name}
            </span>
            <Link
              href="/dashboard"
              className="inline-flex min-h-9 items-center rounded-control px-2.5 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              პროფილი
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <AdminNav queueCount={queueCount} />

      <main
        id="main"
        className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
