import Link from 'next/link';

/*
 * All four documents live on one page now, so these are anchors rather than
 * routes. The labels stay separate because a footer that says only
 * "იურიდიული" hides what is actually there.
 */
const LEGAL_LINKS = [
  { href: '/legal#terms', label: 'წესები და პირობები' },
  { href: '/legal#privacy', label: 'კონფიდენციალურობა' },
  { href: '/legal#refunds', label: 'დაბრუნების პოლიტიკა' },
  { href: '/legal#responsible-use', label: 'პასუხისმგებლიანი გამოყენება' },
  { href: '/contact', label: 'კონტაქტი' },
];

/**
 * Deliberately minimal.
 *
 * The bookmaker boundary and the 18+ notice used to live down here; they now
 * sit in the ResponsibleUseNotice that every page renders in its own content,
 * where they are actually read. Repeating them in the footer only made the
 * page look busier without making the claim any more visible.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-ink-muted">
          DAJDA · dajda.ge © {new Date().getFullYear()}
        </p>

        <nav aria-label="იურიდიული ინფორმაცია">
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-0">
            {LEGAL_LINKS.map((link, index) => (
              <li key={link.href} className="flex items-center">
                {index > 0 ? (
                  <span className="text-ink-faint" aria-hidden="true">
                    |
                  </span>
                ) : null}
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center px-2 text-ink-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
