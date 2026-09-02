'use client';

import { useActionState, useRef, useState } from 'react';
import { decidePayoutAction } from '@/actions/payouts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Releasing or refusing a payout.
 *
 * Two buttons with different weights, because the two outcomes are not
 * symmetrical. Release moves money and cannot be taken back, so it is the
 * committed button and asks once, naming the amount and the card, before it
 * posts. Refusal returns the money to the author's balance, so it is cheap to
 * do and easy to explain, and it insists on a reason: "მიზეზი მითითებული
 * არაა" was the note on every refused request before this, which told the
 * author nothing.
 *
 * The card number travels sealed with the request, so approval is one press.
 * A request that carries no sealed number (made before sealing existed, or
 * sealed under a key since rotated) shows a field to type it, and the service
 * checks what is typed against the mask taken at request time.
 */
export function DecidePayoutForm({
  payoutId,
  maskedCard,
  hasStoredCard,
  amountLabel,
}: {
  payoutId: string;
  maskedCard: string;
  hasStoredCard: boolean;
  /** Already formatted, e.g. "120.00 ₾": what the confirm names. */
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(decidePayoutAction, null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  if (state?.ok) {
    return (
      <Alert tone="success">
        {state.data.status === 'REJECTED'
          ? 'მოთხოვნა უარყოფილია, თანხა ავტორს დაუბრუნდა.'
          : 'გატანა დადასტურდა.'}
      </Alert>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const decision =
          submitter instanceof HTMLButtonElement ? submitter.value : '';

        if (decision === 'REJECT') {
          if (!reasonRef.current?.value.trim()) {
            event.preventDefault();
            setReasonMissing(true);
            reasonRef.current?.focus();
          }
          return;
        }

        if (
          decision === 'APPROVE' &&
          !window.confirm(`გავიტანოთ ${amountLabel} ბარათზე ${maskedCard}?`)
        ) {
          event.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="payoutId" value={payoutId} />

      {generalError ? <Alert tone="error">{generalError}</Alert> : null}
      {fieldErrors?.cardNumber?.[0] ? (
        <Alert tone="error">{fieldErrors.cardNumber[0]}</Alert>
      ) : null}

      {!hasStoredCard ? (
        <div>
          <label
            htmlFor={`card-${payoutId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            ბარათის ნომერი
          </label>
          <input
            id={`card-${payoutId}`}
            name="cardNumber"
            inputMode="numeric"
            autoComplete="off"
            placeholder={maskedCard}
            aria-describedby={`card-${payoutId}-hint`}
            className="tabular min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink sm:w-64"
          />
          <p id={`card-${payoutId}-hint`} className="mt-1 text-xs text-ink-faint">
            ამ მოთხოვნას ნომერი არ ახლავს: შეიყვანეთ ხელით, ნიღბის მიხედვით.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button
          type="submit"
          name="decision"
          value="APPROVE"
          size="sm"
          disabled={pending}
        >
          {pending ? 'მუშავდება…' : `გატანა · ${amountLabel}`}
        </Button>
        {hasStoredCard ? (
          <span className="tabular text-sm text-ink-muted">
            ბარათზე {maskedCard}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-2 border-t border-line pt-3">
        <div className="min-w-0 flex-1 sm:flex-none">
          <label htmlFor={`reason-${payoutId}`} className="sr-only">
            უარის მიზეზი
          </label>
          <input
            ref={reasonRef}
            id={`reason-${payoutId}`}
            name="reason"
            maxLength={300}
            placeholder="უარის მიზეზი, ავტორი დაინახავს"
            aria-invalid={reasonMissing || undefined}
            aria-describedby={reasonMissing ? `reason-${payoutId}-error` : undefined}
            onChange={() => setReasonMissing(false)}
            className={`min-h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink sm:w-72 ${
              reasonMissing ? 'border-loss' : 'border-line'
            }`}
          />
          {reasonMissing ? (
            <p
              id={`reason-${payoutId}-error`}
              className="mt-1 text-xs text-loss"
              role="alert"
            >
              უარყოფას მიზეზი სჭირდება.
            </p>
          ) : null}
        </div>
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
