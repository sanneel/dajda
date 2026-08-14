import type { Metadata } from 'next';
import Link from 'next/link';
import { VerifyEmailForm } from './verify-form';

export const metadata: Metadata = {
  title: 'ელფოსტის დადასტურება',
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        ელფოსტის დადასტურება
      </h1>

      <div className="mt-6">
        <VerifyEmailForm token={token} />
      </div>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        <Link href="/dashboard" className="text-accent hover:underline">
          პროფილზე გადასვლა
        </Link>
      </p>
    </div>
  );
}
