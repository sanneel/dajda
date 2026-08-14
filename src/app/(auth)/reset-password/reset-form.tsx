'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/actions/auth';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" title="პაროლი შეიცვალა">
        ახლა შეგიძლიათ{' '}
        <Link href="/login" className="underline">
          შეხვიდეთ ახალი პაროლით
        </Link>
        .
      </Alert>
    );
  }

  if (!token) {
    return (
      <Alert tone="error" title="ბმული არასწორია">
        აღდგენის ბმული არასრულია. მოითხოვეთ ახალი{' '}
        <Link href="/forgot-password" className="underline">
          პაროლის აღდგენის გვერდიდან
        </Link>
        .
      </Alert>
    );
  }

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <Field
        label="ახალი პაროლი"
        htmlFor="password"
        required
        hint="მინიმუმ 10 სიმბოლო, უნდა შეიცავდეს ასოსა და ციფრს."
        error={fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={Boolean(fieldErrors?.password?.[0])}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'ინახება…' : 'პაროლის შეცვლა'}
      </Button>
    </form>
  );
}
