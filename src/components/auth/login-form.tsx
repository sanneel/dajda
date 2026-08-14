'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction } from '@/actions/auth';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  // A failed login has no field-level detail on purpose - see loginAction.
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  return (
    <form action={action} className="space-y-4" noValidate>
      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <Field label="ელფოსტა" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="mail@example.ge"
        />
      </Field>

      <Field label="პაროლი" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-ink-muted hover:text-ink"
        >
          დაგავიწყდათ პაროლი?
        </Link>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'მოწმდება…' : 'შესვლა'}
      </Button>
    </form>
  );
}
