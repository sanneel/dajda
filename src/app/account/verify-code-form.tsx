'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailCodeAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';

/**
 * The typable half of the verification mail.
 *
 * The mail carries a button and a 6 digit code because they cover different
 * situations: the button when the mail is open on the same device, the code
 * when it is open on a phone and the site on a laptop.
 *
 * SUBMITS ITSELF at the sixth digit. A browser cannot read a code out of an
 * email (the WebOTP autofill API is SMS-only), so the closest thing to
 * "fills in by itself" is that typing or pasting the code IS the whole
 * gesture - no second button press. Each distinct value is submitted once:
 * a wrong code is not hammered against the rate limit by re-renders, and
 * correcting a digit arms the auto-submit again.
 */
export function VerifyCodeForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmitted = useRef<string | null>(null);
  const [code, setCode] = useState('');
  const [state, action, pending] = useActionState(verifyEmailCodeAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (
      code.length === 6 &&
      !pending &&
      lastSubmitted.current !== code &&
      formRef.current
    ) {
      lastSubmitted.current = code;
      formRef.current.requestSubmit();
    }
  }, [code, pending]);

  if (state?.ok) {
    return <p className="text-sm">ელფოსტა დადასტურდა.</p>;
  }

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="code"
          value={code}
          onChange={(event) =>
            // Digits only, so a paste of "123 456" lands as 123456.
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          aria-label="დადასტურების კოდი წერილიდან"
          className="tabular h-11 w-32 rounded-control border border-line bg-surface px-3 text-center text-base tracking-[0.25em] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'მოწმდება…' : 'დადასტურება'}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-loss">{state.error.message}</p>
      ) : null}
    </form>
  );
}
