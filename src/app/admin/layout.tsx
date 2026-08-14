import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { Logo } from '@/components/brand/logo';
import { LogoutButton } from '@/components/logout-button';

const NAV = [
  { href: '/admin', label: 'მიმოხილვა' },
  { href: '/admin/users', label: 'მომხმარებლები' },
  { href: '/admin/analysts', label: 'ანალიტიკოსები' },
  { href: '/admin/predictions', label: 'ფსონები' },
  { href: '/admin/reports', label: 'საჩივრები' },
  { href: '/admin/notifications', label: 'შეტყობინებები' },
  { href: '/admin/payments', label: 'გადახდები' },
  { href: '/admin/audit', label: 'აუდიტის ჟურნალი' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Authoritative check. The proxy layer performs no access control at all.
  const actor = await getCurrentUser();
  if (!actor) redirect('/login');
  if (actor.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-page items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="DAJDA: მთავარი გვერდი">
            <Logo size={24} />
          </Link>
          <span className="rounded border border-accent/35 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            ადმინი
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">
              {actor.name}
            </span>
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink"
            >
              პროფილი
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6"
      >
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="ადმინის ნავიგაცია">
            <ul className="space-y-1 lg:sticky lg:top-24">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="pt-2">
                <LogoutButton />
              </li>
            </ul>
          </nav>

          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
