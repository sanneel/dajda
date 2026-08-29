'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Crown, Home, LogIn, Ticket, User } from 'lucide-react';

/**
 * App-style tab bar, phones and tablets only.
 *
 * The primary way around the product on a small screen: the places a person
 * switches between many times a session, one tap away at the thumb. The
 * drawer behind the header button stays for everything visited once - theme,
 * admin, how-it-works, legal - so the bar never needs more than five tabs.
 *
 * The tab set depends on who is looking. A visitor gets an entry point to
 * sign in; a member gets their profile; an analyst also gets their own bets,
 * because for them that is the most-visited screen of all. Admin is not a
 * tab: phone-sized moderation is rare enough to live in the drawer.
 */

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
};

function tabsFor(isAuthenticated: boolean, isAnalyst: boolean): Tab[] {
  return [
    { href: '/', label: 'მთავარი', icon: Home },
    { href: '/free', label: 'უფასო', icon: Ticket },
    { href: '/paid', label: 'ფასიანი', icon: Crown },
    ...(isAnalyst
      ? [{ href: '/analyst', label: 'ჩემი ფსონები', icon: BarChart3 }]
      : []),
    isAuthenticated
      ? { href: '/dashboard', label: 'პროფილი', icon: User }
      : { href: '/login', label: 'შესვლა', icon: LogIn },
  ];
}

export function BottomNav({
  isAuthenticated,
  isAnalyst,
}: {
  isAuthenticated: boolean;
  isAnalyst: boolean;
}) {
  const pathname = usePathname();
  const tabs = tabsFor(isAuthenticated, isAnalyst);

  return (
    <nav
      aria-label="სწრაფი ნავიგაცია"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          /*
           * Segment-aware matching, not startsWith: "/analysts/[slug]" begins
           * with "/analyst", and a plain prefix test would light the analyst
           * tab on someone else's profile.
           */
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                  active ? 'text-accent' : 'text-ink-faint hover:text-ink'
                }`}
              >
                <Icon
                  className="size-5"
                  aria-hidden="true"
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="w-full truncate text-center text-[10px] leading-none">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
