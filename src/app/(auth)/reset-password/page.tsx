import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = {
  title: 'ახალი პაროლი',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        ახალი პაროლი
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        შეიყვანეთ ახალი პაროლი. ყველა აქტიური სესია დაიხურება.
      </p>

      <div className="mt-6">
        <ResetPasswordForm token={token} />
      </div>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        <Link href="/login" className="text-accent hover:underline">
          დაბრუნება შესვლაზე
        </Link>
      </p>
    </div>
  );
}
