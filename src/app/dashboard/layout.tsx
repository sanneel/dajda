import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { LogoutButton } from '@/components/logout-button';

/*
 * A short horizontal nav, not a sidebar.
 *
 * It used to list five entries, four of which were slices of the same account
 * that now sit on one page. ანგარიში and პარამეტრები are the two real
 * destinations; a non-analyst also gets the way into ანალიტიკოსად
 * რეგისტრაცია, an analyst their own workspace.
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
    <div className="flex min-h-dvh flex-col pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
      <SiteHeader />

      <main
        id="main"
        className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-8"
      >
        <nav
          aria-label="პროფილის ნავიგაცია"
          className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-4"
        >
          <ul className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <li>
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
              >
                ანგარიში
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/settings"
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
              >
                პარამეტრები
              </Link>
            </li>
            <li>
              {/*
               * Three states, not two: an APPROVED analyst gets their
               * workspace, a PENDING applicant a status link (the workspace
               * would just refuse them), everyone else the way to apply.
               */}
              {actor.analystStatus === 'APPROVED' ? (
                <Link
                  href="/analyst"
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  ჩემი ფსონები
                </Link>
              ) : actor.analystStatus === 'PENDING' ? (
                <Link
                  href="/apply"
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                  title="ანალიტიკოსის განაცხადი განიხილება"
                >
                  განაცხადი…
                </Link>
              ) : (
                <Link
                  href="/apply"
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                >
                  ანალიტიკოსობა
                </Link>
              )}
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
