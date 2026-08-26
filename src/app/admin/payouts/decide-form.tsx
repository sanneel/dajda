'use client';

import { useActionState } from 'react';
import { decidePayoutAction } from '@/actions/payouts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Releasing a payout asks for the card number again.
 *
 * The number was never stored, so it cannot be filled in from the record. The
 * service checks what is typed against the mask taken at request time, which
 * also means an approval cannot quietly redirect the money to another card.
 */
export function DecidePayoutForm({
  payoutId,
  maskedCard,
}: {
  payoutId: string;
  maskedCard: string;
}) {
  const [state, action, pending] = useActionState(decidePayoutAction, null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  if (state?.ok) {
    return <Alert tone="success">გადაწყვეტილება დაფიქსირდა: {state.data.status}</Alert>;
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="payoutId" value={payoutId} />

      {generalError ? <Alert tone="error">{generalError}</Alert> : null}
      {fieldErrors?.cardNumber?.[0] ? (
        <Alert tone="error">{fieldErrors.cardNumber[0]}</Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`card-${payoutId}`} className="sr-only">
          ბარათის ნომერი
        </label>
        <input
          id={`card-${payoutId}`}
          name="cardNumber"
          inputMode="numeric"
          autoComplete="off"
          placeholder={maskedCard}
          className="tabular w-52 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        />
        <label htmlFor={`reason-${payoutId}`} className="sr-only">
          უარის მიზეზი
        </label>
        <input
          id={`reason-${payoutId}`}
          name="reason"
          placeholder="უარის მიზეზი"
          className="w-52 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="APPROVE"
          size="sm"
          disabled={pending}
        >
          {pending ? 'მუშავდება…' : 'გატანის დადასტურება'}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECT"
          size="sm"
          variant="danger"
          disabled={pending}
        >
          უარყოფა
        </Button>
      </div>
    </form>
  );
}
