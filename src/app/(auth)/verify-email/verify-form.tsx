'use client';

import { useActionState } from 'react';
import { verifyEmailAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" title="ელფოსტა დადასტურდა">
        მადლობა. ანგარიში სრულად აქტიურია.
      </Alert>
    );
  }

  if (!token) {
    return (
      <Alert tone="info" title="ბმული საჭიროა">
        დადასტურების ბმული იგზავნება რეგისტრაციისას მითითებულ ელფოსტაზე.
        <br />
        <span className="mt-2 block text-xs">
          შენიშვნა: ელფოსტის გაგზავნის სერვისი ჯერ არ არის დაკავშირებული.
          ტოკენი იქმნება, მაგრამ წერილი არ იგზავნება.
        </span>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <p className="text-sm text-ink-muted">
        დააჭირეთ ღილაკს ელფოსტის დასადასტურებლად.
      </p>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'მოწმდება…' : 'დადასტურება'}
      </Button>
    </form>
  );
}
