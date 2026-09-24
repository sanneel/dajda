import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { NavLinks } from './nav-links';

/**
 * The site header without the parts that need the session.
 *
 * Shown by the root loading state while a section with its own layout (the
 * account, the analyst workspace, admin) checks who is asking. It keeps the
 * bar, the wordmark and the nav exactly where SiteHeader draws them, so
 * entering one of those sections does not blink the header away; only the
 * account controls on the right wait, as a quiet placeholder.
 */
export function SiteHeaderShell() {
  return (
    <header className="relative z-50 border-b border-line bg-surface">
      <div className="mx-auto flex h-[4.25rem] max-w-page items-center gap-8 px-4 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="მთავარი გვერდი">
          <Logo size={28} />
        </Link>

        <nav aria-label="მთავარი ნავიგაცია" className="hidden lg:block">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <span
            aria-hidden="true"
            className="size-9 rounded-full bg-elevated"
          />
        </div>
      </div>
    </header>
  );
}
