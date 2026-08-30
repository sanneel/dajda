import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { LoginForm } from '@/components/auth/login-form';
import { SocialSignIn } from '@/components/auth/social-signin';
import { Alert } from '@/components/ui/feedback';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'შესვლა',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already signed in - no reason to show the form again.
  if (await getCurrentUser()) redirect('/dashboard');

  // The Google callback funnels every failure here with one flag; the
  // distinctions live in the server log, where they are actionable.
  const googleFailed = (await searchParams).error === 'google';

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">შესვლა</h1>
      {googleFailed ? (
        <div className="mt-4">
          <Alert tone="error">
            Google-ით შესვლა ვერ შედგა. სცადეთ თავიდან, ან შედით ელფოსტით.
          </Alert>
        </div>
      ) : null}
      <p className="mt-1.5 text-sm text-ink-muted">
        შედით ანგარიშში, რომ ნახოთ გამოწერილი ანალიზი.
      </p>

      <div className="mt-6">
        <SocialSignIn />
        <LoginForm />
      </div>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        ანგარიში არ გაქვთ?{' '}
        <Link href="/register" className="text-accent hover:underline">
          რეგისტრაცია
        </Link>
      </p>
    </div>
  );
}
