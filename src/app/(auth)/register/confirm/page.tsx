import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmSignupForm } from './confirm-form';

export const metadata: Metadata = {
  title: 'რეგისტრაციის დასრულება',
  robots: { index: false, follow: false },
};

/**
 * Where the sign-up mail's link lands. The account is created by the button,
 * not by opening the page, so a mail scanner that follows links cannot
 * create one (see completeSignupAction).
 */
export default async function ConfirmSignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        რეგისტრაციის დასრულება
      </h1>

      <div className="mt-6">
        <ConfirmSignupForm token={token} />
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
