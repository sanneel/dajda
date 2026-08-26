import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { TelegramCallback } from './telegram-callback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Telegram-ით შესვლა',
  robots: { index: false, follow: false },
};

/**
 * Where oauth.telegram.org sends the browser back.
 *
 * The signed payload arrives in the URL FRAGMENT, which never reaches this
 * server render - so the page is just the shell, and the client component
 * inside reads the fragment and hands it to the server action for
 * verification. Nothing on this page trusts anything before that check.
 */
export default async function TelegramAuthPage() {
  if (await getCurrentUser()) redirect('/dashboard');

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        Telegram-ით შესვლა
      </h1>

      <div className="mt-5">
        <TelegramCallback />
      </div>
    </div>
  );
}
