'use client';

import { useActionState } from 'react';
import { resendVerificationAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';

export function ResendVerificationButton() {
  const [state, action, pending] = useActionState(
    resendVerificationAction,
    null,
  );

  if (state?.ok) {
    return (
      <p className="text-sm">
        ბმული გაიგზავნა. შეამოწმეთ ელფოსტა და სპამის საქაღალდეც.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'იგზავნება…' : 'ბმულის ხელახლა გაგზავნა'}
      </Button>
      {state && !state.ok ? (
        <span className="text-sm">{state.error.message}</span>
      ) : null}
    </form>
  );
}
