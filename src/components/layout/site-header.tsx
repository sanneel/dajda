import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/authorization';
import { Logo } from '@/components/brand/logo';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthButtons } from '@/components/auth/auth-buttons';
import { telegramBotConfigured } from '@/lib/auth/telegram';
import { BottomNav } from './bottom-nav';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';

/**
 * Site header.
 *
 * A solid bar with a hairline under it, per the reference: wordmark, then the
 * nav immediately beside it, then the theme control and account controls
 * pushed right. It does not float over the hero, so it is opaque and every
 * page reserves its height normally.
 */
export async function SiteHeader() {
  const actor = await getCurrentUser();
  const isAdmin = actor?.role === 'ADMIN';
  const isAnalyst = Boolean(actor?.analystProfileId);

  return (
    <>
    <header className="relative z-50 border-b border-line bg-surface">
      <div className="mx-auto flex h-[4.25rem] max-w-page items-center gap-8 px-4 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="მთავარი გვერდი">
          <Logo size={28} />
        </Link>

        {/*
         * Desktop nav switches in at lg, not md: the Georgian labels plus both
         * auth buttons overflow a 768px viewport, so tablets keep the drawer.
         */}
        <nav aria-label="მთავარი ნავიგაცია" className="hidden lg:block">
          <NavLinks />
        </nav>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {isAnalyst ? (
            <Link
              href="/analyst"
              className="inline-flex min-h-11 items-center px-2 text-sm text-accent hover:underline"
            >
              ჩემი ფსონები
            </Link>
          ) : null}

          {isAdmin ? (
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center px-2 text-sm text-accent hover:underline"
            >
              ადმინი
            </Link>
          ) : null}

          <ThemeToggle />

          {actor ? (
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong px-4 text-sm text-ink transition-colors hover:border-ink-faint"
            >
              <Avatar name={actor.name} size="sm" />
              <span className="max-w-32 truncate">{actor.name}</span>
            </Link>
          ) : (
            <AuthButtons telegramConfigured={telegramBotConfigured()} />
          )}
        </div>

        {/*
         * The theme control does NOT repeat here: three 32px segments plus the
         * menu button crowd the bar off the right edge on a small phone. It
         * lives inside the drawer on this breakpoint instead.
         */}
        <div className="ml-auto lg:hidden">
          <MobileNav
            isAuthenticated={Boolean(actor)}
            isAdmin={isAdmin}
            isAnalyst={isAnalyst}
          />
        </div>
      </div>
    </header>

    {/*
     * The app-style tab bar on phones. Rendered here rather than in each
     * layout so a page cannot end up with the header but without the bar.
     * It is position:fixed, so its place in the DOM does not matter; the
     * layouts reserve its height with bottom padding.
     */}
    <BottomNav isAuthenticated={Boolean(actor)} isAnalyst={isAnalyst} />
    </>
  );
}
