'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { loginAction } from '@/actions/auth';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  // Controlled so a wrong password does not also erase the typed email
  // (React 19 resets uncontrolled fields after a form action).
  const [email, setEmail] = useState('');

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  // A failed login has no field-level detail on purpose - see loginAction.
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  return (
    <form
      action={action}
      className="space-y-4"
      noValidate
      /*
       * React 19 resets the form after every action, flipping checkboxes off
       * at the DOM level even when their React state says on. The reset event
       * is cancelable; canceling it keeps every typed value through a failed
       * submit.
       */
      onReset={(event) => event.preventDefault()}
    >
      {generalError ? <Alert tone="error">{generalError}</Alert> : null}

      <Field label="ელფოსტა" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="mail@example.ge"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
