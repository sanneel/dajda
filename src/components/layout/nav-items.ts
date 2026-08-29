export type NavItem = { href: string; label: string };

/** Primary navigation, shared by the desktop bar and the mobile sheet. */
/*
 * No "გამოწერები" entry: a subscription is bought on the analyst's own
 * profile, so there is no platform-wide purchase page to navigate to. Managing
 * an existing subscription lives under /dashboard.
 *
 * No "სტატისტიკა" entry either: the platform record now sits on the home page,
 * above the analysts it describes, instead of on a page of its own.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/free', label: 'უფასო პროგნოზები' },
  { href: '/paid', label: 'ფასიანი პროგნოზები' },
  { href: '/how-it-works', label: 'როგორ მუშაობს?' },
];
