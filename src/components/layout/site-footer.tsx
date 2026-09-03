import Link from 'next/link';
import { COMPANY } from '@/lib/company';
import { PaymentMarks } from '@/components/payment-marks';

/*
 * All four documents live on one page now, so these are anchors rather than
 * routes. The labels stay separate because a footer that says only
 * "იურიდიული" hides what is actually there.
 */
const LEGAL_LINKS = [
  { href: '/pricing', label: 'ფასები' },
  { href: '/legal#terms', label: 'წესები და პირობები' },
  { href: '/legal#privacy', label: 'კონფიდენციალურობა' },
  { href: '/legal#refunds', label: 'დაბრუნების პოლიტიკა' },
  { href: '/legal#responsible-use', label: 'პასუხისმგებლიანი გამოყენება' },
  { href: '/contact', label: 'კონტაქტი' },
  { href: '/legal#requisites', label: 'რეკვიზიტები' },
];

/**
 * Two rows and nothing more.
 *
 * The first is the links. The second is how to reach the site, plus the card
 * marks: the payment provider requires the legal entity, its identification
 * code, an address, a phone, an email and the Visa and Mastercard logos to be
 * reachable from every page. The entity and its code are a person's name and
 * personal number while the merchant is a sole trader, so they stay on the
 * legal page, one click away through the "რეკვიზიტები" link, rather than
 * being printed under every page.
 *
 * The bookmaker boundary and the 18+ notice used to live down here; they now
 * sit in the ResponsibleUseNotice that every page renders in its own content,
 * where they are actually read.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-8 text-sm xl:flex-row xl:items-center xl:justify-between xl:px-6">
        <p className="text-ink-muted">
          DAJDA · dajda.ge © {new Date().getFullYear()}
        </p>

        <nav aria-label="იურიდიული ინფორმაცია">
          {/*
           * Two shapes, because a separated row only works while it fits on
           * one line. Wrapped, the separator travels with the item it
           * precedes and lands at the start of the next line as a stray "|",
           * so below xl the links become a plain two-column grid and the
           * separators are not rendered at all.
           */}
          <ul className="grid w-fit max-w-full grid-cols-2 gap-x-6 xl:flex xl:w-auto xl:flex-wrap xl:items-center xl:gap-x-1">
            {LEGAL_LINKS.map((link, index) => (
              <li key={link.href} className="flex items-center">
                {index > 0 ? (
                  <span
                    className="hidden text-ink-faint xl:inline"
                    aria-hidden="true"
                  >
                    |
                  </span>
                ) : null}
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-ink-muted transition-colors hover:text-ink xl:px-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-5 text-xs text-ink-faint xl:flex-row xl:items-center xl:justify-between xl:px-6">
          <address className="not-italic leading-relaxed">
            <p>
              {COMPANY.addressKa} ·{' '}
              <a
                href={`tel:+995${COMPANY.phone.replace(/\s/g, '')}`}
                className="tabular hover:text-ink"
              >
                {COMPANY.phone}
              </a>{' '}
              ·{' '}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="hover:text-ink"
              >
                {COMPANY.supportEmail}
              </a>
            </p>
          </address>

          <div className="flex items-center gap-3">
            <span>გადახდა:</span>
            <PaymentMarks size="md" withWallets />
          </div>
        </div>
      </div>
    </footer>
  );
}
