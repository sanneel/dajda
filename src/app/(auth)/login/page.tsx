import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { LoginForm } from '@/components/auth/login-form';
import { TelegramLoginButton } from '@/components/auth/telegram-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'შესვლა',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Already signed in - no reason to show the form again.
  if (await getCurrentUser()) redirect('/dashboard');

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">შესვლა</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        შედით ანგარიშში, რომ ნახოთ გამოწერილი ანალიზი.
      </p>

      <div className="mt-6">
        <LoginForm />
        <TelegramLoginButton />
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
