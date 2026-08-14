import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { LogoutButton } from '@/components/logout-button';

/*
 * Two destinations, so the sidebar is gone.
 *
 * It used to list five, four of which were slices of the same account that now
 * sit on one page. A sticky 15rem column to switch between two pages costs
 * more than it navigates.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Real access control: the session is resolved from the database here, not
  // inferred from a cookie's presence.
  const actor = await getCurrentUser();
  if (!actor) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6"
      >
        <nav
          aria-label="პროფილის ნავიგაცია"
          className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-4"
        >
          <ul className="flex items-center gap-1">
            <li>
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
              >
                ანგარიში
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/settings"
                className="inline-flex min-h-11 items-center rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
              >
                პარამეტრები
              </Link>
            </li>
          </ul>

          <LogoutButton />
        </nav>

        <div className="min-w-0">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
