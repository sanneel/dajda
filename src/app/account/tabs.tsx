import Link from 'next/link';

/**
 * The account's three questions.
 *
 * Real links with a `tab` query rather than client state, so each one is
 * bookmarkable, shareable, and lands where the browser's Back button expects
 * to go. Anything else here would be a page that looks navigable and is not.
 */
export const ACCOUNT_TABS = [
  { id: 'overview', label: 'მიმოხილვა' },
  { id: 'preferences', label: 'პრეფერენციები' },
  { id: 'security', label: 'უსაფრთხოება' },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]['id'];

/** Only what the tab strip actually offers; anything else is the overview. */
export function accountTabFrom(value: unknown): AccountTab {
  return ACCOUNT_TABS.some((tab) => tab.id === value)
    ? (value as AccountTab)
    : 'overview';
}

export function AccountTabs({ current }: { current: AccountTab }) {
  return (
    <nav aria-label="ანგარიშის სექციები" className="border-b border-line">
      {/* Scrolls rather than wraps on a phone: three Georgian words do not
          fit on one 360px line, and a second row of tabs reads as a second
          navigation. */}
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ACCOUNT_TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={
                  tab.id === 'overview' ? '/account' : `/account?tab=${tab.id}`
                }
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
                  active
                    ? 'border-accent font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
