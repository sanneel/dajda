'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The admin's map: four places, not nine links.
 *
 * The nine-item sidebar listed every table the database had, in no order a
 * person works in. An administrator's day is a queue - bets to settle,
 * applications to approve, payouts to release, reports to answer - and the
 * rest is reference they open to look something up. So the first place IS
 * the queue, and each of the other three groups a job with the reference
 * pages that belong to it. Where a section has more than one page, a second
 * row of tabs appears under the first; a section with one page shows none.
 *
 * Client-side only for `usePathname`: the map itself is static, and the
 * queue count comes from the server layout as a prop.
 */

type Page = { href: string; label: string };
type Section = { id: string; label: string; pages: Page[] };

const SECTIONS: Section[] = [
  {
    id: 'work',
    label: 'სამუშაო',
    pages: [
      { href: '/admin', label: 'რიგი' },
      { href: '/admin/predictions', label: 'ყველა ფსონი' },
      { href: '/admin/reports', label: 'საჩივრები' },
    ],
  },
  {
    id: 'authors',
    label: 'ავტორები',
    pages: [
      { href: '/admin/analysts', label: 'ავტორები' },
      { href: '/admin/users', label: 'მომხმარებლები' },
    ],
  },
  {
    id: 'money',
    label: 'ფული',
    pages: [
      { href: '/admin/payouts', label: 'გატანები' },
      { href: '/admin/payments', label: 'გადახდები' },
    ],
  },
  {
    id: 'log',
    label: 'ჟურნალი',
    pages: [
      { href: '/admin/audit', label: 'აუდიტი' },
      { href: '/admin/notifications', label: 'შეტყობინებები' },
    ],
  },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ queueCount }: { queueCount: number }) {
  const pathname = usePathname();

  const active =
    SECTIONS.find((section) =>
      section.pages.some((page) => isCurrent(pathname, page.href)),
    ) ?? SECTIONS[0]!;

  return (
    <div className="border-b border-line bg-surface">
      <nav
        aria-label="ადმინის განყოფილებები"
        className="mx-auto max-w-page px-4 sm:px-6"
      >
        {/* Scrolls sideways on a phone, like every other tab strip here. */}
        <ul className="-mb-px flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((section) => {
            const selected = section.id === active.id;
            const first = section.pages[0]!;
            return (
              <li key={section.id} className="shrink-0">
                <Link
                  href={first.href}
                  aria-current={selected ? 'page' : undefined}
                  className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm transition-colors ${
                    selected
                      ? 'border-ink font-semibold text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  {section.label}
                  {section.id === 'work' && queueCount > 0 ? (
                    <span
                      className={`tabular rounded-full px-1.5 text-xs ${
                        selected
                          ? 'bg-ink text-on-ink'
                          : 'bg-elevated text-ink-muted'
                      }`}
                      aria-label={`${queueCount} გადასაწყვეტი`}
                    >
                      {queueCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {active.pages.length > 1 ? (
        <nav
          aria-label={`${active.label}: გვერდები`}
          className="border-t border-line bg-canvas"
        >
          <ul className="mx-auto flex max-w-page gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {active.pages.map((page) => {
              const selected = isCurrent(pathname, page.href);
              return (
                <li key={page.href} className="shrink-0">
                  <Link
                    href={page.href}
                    aria-current={selected ? 'page' : undefined}
                    className={`inline-flex min-h-9 items-center rounded-control px-3 text-sm transition-colors ${
                      selected
                        ? 'bg-elevated font-medium text-ink'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
