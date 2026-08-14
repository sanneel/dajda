'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';

/**
 * Primary nav, with the current section underlined.
 *
 * A client component only because it needs the pathname. The underline is a
 * real border on the link rather than a floating bar, so it cannot drift out
 * of alignment when the Georgian labels change width.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-7">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-[4.25rem] items-center border-b-2 text-sm transition-colors ${
                active
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
