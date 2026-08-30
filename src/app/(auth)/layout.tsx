import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/authorization';
import { Logo } from '@/components/brand/logo';
import { BottomNav } from '@/components/layout/bottom-nav';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  /*
   * Auth pages must never be a dead end. On a phone the way out is the same
   * tab bar every other page has, plus an explicit link back beside the logo
   * - a lone small wordmark was not read as an exit.
   */
  const actor = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="flex items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="მთავარი გვერდი">
          <Logo size={26} />
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          მთავარზე დაბრუნება
        </Link>
      </header>

      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-4 pb-6 text-center sm:px-6">
        <p className="text-xs text-ink-faint">
          DAJDA არ არის ბუკმეკერი და არ იღებს ფსონებს. 18+
        </p>
      </footer>

      <BottomNav
        isAuthenticated={Boolean(actor)}
        isAnalyst={actor?.analystStatus === 'APPROVED'}
      />
    </div>
  );
}
