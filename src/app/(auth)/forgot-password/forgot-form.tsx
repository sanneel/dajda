'use client';

import { useActionState } from 'react';
import { forgotPasswordAction } from '@/actions/auth';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" title="შემოწმეთ ელფოსტა">
        თუ ეს მისამართი დარეგისტრირებულია, აღდგენის ბმული გამოგზავნილია.
        ბმული მოქმედებს 1 საათის განმავლობაში.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

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

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'იგზავნება…' : 'ბმულის გამოგზავნა'}
      </Button>

      {/* Honest about the current state of the integration. */}
      <p className="text-xs leading-relaxed text-ink-faint">
        შენიშვნა: ელფოსტის გაგზავნის სერვისი ჯერ არ არის დაკავშირებული.
        დეველოპმენტში ბმული იბეჭდება სერვერის კონსოლში.
      </p>
    </form>
  );
}
