'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailCodeAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';

/**
 * The typable half of the verification mail.
 *
 * The mail carries a button and a 6 digit code because they cover different
 * situations: the button when the mail is open on the same device, the code
 * when it is open on a phone and the site on a laptop. This form is where the
 * code lands.
 */
export function VerifyCodeForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(verifyEmailCodeAction, null);

  if (state?.ok) {
    // The refresh re-reads the session server-side, which removes the banner
    // this form lives in.
    router.refresh();
    return <p className="text-sm">ელფოსტა დადასტურდა.</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={7}
        placeholder="123456"
        aria-label="დადასტურების კოდი წერილიდან"
        className="tabular h-11 w-28 rounded-control border border-line bg-surface px-3 text-center text-base tracking-[0.25em] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'მოწმდება…' : 'დადასტურება'}
      </Button>
      {state && !state.ok ? (
        <span className="text-sm">{state.error.message}</span>
      ) : null}
    </form>
  );
}
