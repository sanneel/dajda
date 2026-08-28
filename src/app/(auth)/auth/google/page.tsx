import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { openGoogleProfile, GOOGLE_PROFILE_COOKIE } from '@/lib/auth/google';
import { GoogleConfirmForm } from './google-confirm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Google-ით რეგისტრაცია',
  robots: { index: false, follow: false },
};

/**
 * The confirmation step for a NEW Google account.
 *
 * Google proved the mailbox; what it cannot prove is the 18+ certification
 * and the agreement to the terms, and this platform must not hold an
 * account that never gave either. The same two checkboxes the register
 * form and the Telegram flow collect, nothing more.
 */
export default async function GoogleConfirmPage() {
  if (await getCurrentUser()) redirect('/dashboard');

  const sealed = (await cookies()).get(GOOGLE_PROFILE_COOKIE)?.value;
  const profile = sealed ? openGoogleProfile(sealed) : null;
  // No valid handoff: the cookie expired or never existed. Start over.
  if (!profile) redirect('/login');

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        თითქმის მზადაა
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Google-მა დაადასტურა მისამართი{' '}
        <span className="font-medium text-ink">{profile.email}</span>. დარჩა
        ორი პირობა, რომელსაც ყველა ანგარიში ადასტურებს.
      </p>

      <div className="mt-6">
        <GoogleConfirmForm name={profile.name} />
      </div>
    </div>
  );
}
