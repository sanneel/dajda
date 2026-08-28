'use client';

import { useActionState, useState } from 'react';
import { closeAccountAction } from '@/actions/account';
import { Button } from '@/components/ui/button';

/**
 * The account's exit.
 *
 * Two deliberate steps - a button that only reveals the form, then a typed
 * confirmation word - because this is the one action on the page that cannot
 * be softened by an undo. The word, not the password: a Telegram-created
 * account has a password its owner never saw.
 */
export function CloseAccountForm() {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(closeAccountAction, null);

  if (!armed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          დახურვა გააუქმებს აქტიურ გამოწერებს და დახურავს წვდომას. გამოქვეყნებული
          ჩანაწერი და გადახდების ისტორია კანონის მოთხოვნით ინახება.
        </p>
        <Button type="button" variant="danger" size="sm" onClick={() => setArmed(true)}>
          ანგარიშის დახურვა
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-ink">
        დასადასტურებლად ჩაწერეთ სიტყვა{' '}
        <strong className="font-semibold">დახურვა</strong> და დააჭირეთ ღილაკს.
        ეს მოქმედება შეუქცევადია.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirmation"
          autoComplete="off"
          placeholder="დახურვა"
          aria-label="დამადასტურებელი სიტყვა"
          className="h-11 w-40 rounded-control border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-faint focus:border-loss focus:outline-none"
        />
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? 'იხურება…' : 'დახურვის დადასტურება'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(false)}>
          გადაფიქრება
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-loss">{state.error.message}</p>
      ) : null}
    </form>
  );
}
