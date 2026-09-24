'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { completeSignupAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function ConfirmSignupForm({ token }: { token: string }) {
  // On success the action redirects to /account, so only failures come back.
  const [state, action, pending] = useActionState(completeSignupAction, null);

  if (!token) {
    return (
      <Alert tone="info" title="ბმული საჭიროა">
        რეგისტრაციის დასრულების ბმული მოდის ელფოსტაზე.{' '}
        <Link href="/register" className="text-accent underline">
          რეგისტრაცია
        </Link>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state && !state.ok ? <Alert tone="error">{state.error.message}</Alert> : null}

      <p className="text-sm text-ink-muted">
        დააჭირეთ ღილაკს: ანგარიში შეიქმნება და შეხვალთ.
      </p>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'იქმნება…' : 'ანგარიშის შექმნა'}
      </Button>
    </form>
  );
}
