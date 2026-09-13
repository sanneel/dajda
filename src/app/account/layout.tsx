import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

/*
 * No navigation of its own.
 *
 * These pages used to carry a strip of links that existed nowhere else on the
 * site, so the account section navigated differently from everything around
 * it and the links were only reachable once you were already inside. They now
 * live in the sheet behind the avatar, which is on every page.
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
        <div className="min-w-0">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
