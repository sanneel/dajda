'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { completeGoogleSignupAction } from '@/actions/google';
import { Checkbox } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function GoogleConfirmForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    completeGoogleSignupAction,
    null,
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <p className="text-sm text-ink-muted">
        ანგარიში შეიქმნება სახელით{' '}
        <span className="font-medium text-ink">{name}</span>.
      </p>

      <div className="space-y-1 border-t border-line pt-4">
        <Checkbox
          id="ageConfirmed"
          name="ageConfirmed"
          label="ვადასტურებ, რომ ვარ 18 წლის ან მეტის."
        />
        <Checkbox
          id="acceptTerms"
          name="acceptTerms"
          label={
            <>
              ვეთანხმები{' '}
              <Link href="/legal#terms" className="text-accent underline">
                წესებსა და პირობებს
              </Link>{' '}
              და{' '}
              <Link href="/legal#privacy" className="text-accent underline">
                კონფიდენციალურობის პოლიტიკას
              </Link>
              .
            </>
          }
        />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'იქმნება…' : 'ანგარიშის შექმნა'}
      </Button>
    </form>
  );
}
