import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 py-6 sm:px-6">
        <Link href="/" aria-label="მთავარი გვერდი">
          <Logo size={26} />
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
    </div>
  );
}
