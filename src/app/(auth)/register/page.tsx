import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/authorization';
import { RegisterForm } from '@/components/auth/register-form';
import { TelegramLoginButton } from '@/components/auth/telegram-button';
import { GoogleLoginButton } from '@/components/auth/google-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'რეგისტრაცია',
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/dashboard');

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        რეგისტრაცია
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        შექმენით ანგარიში, რომ თვალი ადევნოთ ანალიტიკოსების შედეგებს.
      </p>

      <div className="mt-6">
        <RegisterForm />
        <TelegramLoginButton />
        <GoogleLoginButton />
      </div>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        უკვე გაქვთ ანგარიში?{' '}
        <Link href="/login" className="text-accent hover:underline">
          შესვლა
        </Link>
      </p>
    </div>
  );
}
