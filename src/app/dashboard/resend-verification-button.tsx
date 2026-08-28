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
    /*
     * The link comes back only on a deployment where EMAIL_PROVIDER=log, i.e.
     * where the message was written to the server console and this person has
     * no inbox to check. Showing it to them closes the loop; on anything that
     * really sends mail the field is null and this branch never renders.
     */
    return state.data.link ? (
      <div className="space-y-1.5 text-sm">
        <p>
          ელფოსტის გამგზავნი არ არის კონფიგურირებული, ამიტომ წერილი სერვერის
          ჟურნალში დაიწერა. დადასტურება პირდაპირ აქედან შეგიძლიათ:
        </p>
        <a
          href={state.data.link}
          className="inline-block break-all text-accent underline"
        >
          {state.data.link}
        </a>
      </div>
    ) : (
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
