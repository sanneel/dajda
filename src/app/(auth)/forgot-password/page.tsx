import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-form';

export const metadata: Metadata = {
  title: 'პაროლის აღდგენა',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        პაროლის აღდგენა
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        მიუთითეთ ელფოსტა და გამოგიგზავნით აღდგენის ბმულს.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        <Link href="/login" className="text-accent hover:underline">
          დაბრუნება შესვლაზე
        </Link>
      </p>
    </div>
  );
}
