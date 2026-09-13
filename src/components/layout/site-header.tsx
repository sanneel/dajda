import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import { Logo } from '@/components/brand/logo';
import { AccountMenu } from './account-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthButtons } from '@/components/auth/auth-buttons';
import { SocialSignIn } from '@/components/auth/social-signin';
import { BottomNav } from './bottom-nav';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { NotificationBell } from './notification-bell';

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
  // APPROVED, not merely applied: a pending applicant is not an analyst yet.
  const isAnalyst = actor?.analystStatus === 'APPROVED';
  /*
   * An approved analyst's "profile" is their PUBLIC page - the one readers
   * judge them on and the one they check. The workspace behind it (drafts,
   * settling, pricing, broadcasts) is reachable from there, rather than
   * standing beside it in the nav as a second, near-identical profile.
   */
  const profileHref =
    isAnalyst && actor?.analystSlug ? `/analysts/${actor.analystSlug}` : null;

  /*
   * An analyst's earnings, in the bar on every page. It is the number they
   * come back to check, and it was three taps away. Read fresh each render:
   * a webhook can credit it between two page loads, and a stale figure next
   * to the avatar would be worse than none.
   */
  const account =
    isAnalyst && actor
      ? await prisma.user.findUnique({
          where: { id: actor.userId },
          select: {
            earningsMinor: true,
            // The photograph the reader sees on their public page, so the
            // avatar in the bar is the same face rather than initials.
            analystProfile: { select: { photoPath: true } },
          },
        })
      : null;

  const earningsMinor = account?.earningsMinor ?? null;
  const photoPath = account?.analystProfile?.photoPath ?? null;

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
          {profileHref ? (
            <Link
              href={profileHref}
              className="inline-flex min-h-11 items-center px-2 text-sm text-accent hover:underline"
            >
              პროფილი
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

          {earningsMinor !== null ? (
            <Link
              href="/analyst/earnings"
              title="ანაზღაურება: ბილეთებიდან და გამოწერებიდან"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-ink transition-colors hover:border-ink-faint"
            >
              <Wallet className="size-4 text-ink-faint" aria-hidden="true" />
              <span className="tabular">{formatMoney(earningsMinor)}</span>
            </Link>
          ) : null}

          <ThemeToggle />

          {actor ? <NotificationBell userId={actor.userId} /> : null}

          {/* The avatar opens the account sheet rather than jumping to one
              page of it: ანგარიში, პარამეტრები, the workspace and the way
              out are all one tap from here now. */}
          {actor ? (
            <AccountMenu
              name={actor.name}
              photoPath={photoPath}
              analystStatus={actor.analystStatus}
              isAdmin={isAdmin}
              profileHref={profileHref}
            />
          ) : (
            <AuthButtons socialButtons={<SocialSignIn />} />
          )}
        </div>

        {/*
         * The theme control does NOT repeat here: three 32px segments plus the
         * menu button crowd the bar off the right edge on a small phone. It
         * lives inside the drawer on this breakpoint instead.
         */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          {actor ? <NotificationBell userId={actor.userId} /> : null}
          <MobileNav
            isAuthenticated={Boolean(actor)}
            isAdmin={isAdmin}
            isAnalyst={isAnalyst}
            profileHref={profileHref}
            earnings={earningsMinor === null ? null : formatMoney(earningsMinor)}
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
    <BottomNav
      isAuthenticated={Boolean(actor)}
      isAnalyst={isAnalyst}
      profileHref={profileHref}
    />
    </>
  );
}
