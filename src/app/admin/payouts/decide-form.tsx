'use client';

import { useActionState, useRef, useState } from 'react';
import { decidePayoutAction } from '@/actions/payouts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Marking a payout paid, or refusing it.
 *
 * The money moves in the bank, not here: the payment contract covers taking
 * payments, not sending them. So the form puts in front of the administrator
 * exactly what a bank's transfer screen asks for, the recipient, the IBAN and
 * the amount, and then records that the transfer was made.
 *
 * Two buttons with different weights, because the outcomes are not symmetric.
 * "Paid" closes the request and wipes the IBAN, so it asks once before it posts
 * and belongs after the bank has accepted the transfer. Refusal returns the
 * money to the author's balance and insists on a reason the author will read.
 *
 * A request whose IBAN can no longer be opened (sealed under a key since
 * rotated) has nowhere to send money to, so it can only be refused.
 */
export function DecidePayoutForm({
  payoutId,
  iban,
  holderName,
  maskedAccount,
  amountLabel,
}: {
  payoutId: string;
  /** The full IBAN, opened on the server for this page only. */
  iban: string | null;
  /** Who the transfer is addressed to. */
  holderName: string;
  maskedAccount: string;
  /** Already formatted, e.g. "120.00 ₾": what the confirm names. */
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(decidePayoutAction, null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const fieldError = fieldErrors
    ? Object.values(fieldErrors).flat()[0]
    : undefined;
  const generalError =
    state && !state.ok && !fieldErrors ? state.error.message : null;

  if (state?.ok) {
    return (
      <Alert tone="success">
        {state.data.status === 'REJECTED'
          ? 'მოთხოვნა უარყოფილია, თანხა ავტორს დაუბრუნდა.'
          : 'მონიშნულია გადახდილად.'}
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
          decision === 'PAID' &&
          !window.confirm(
            `${amountLabel} გადაირიცხა ანგარიშზე ${maskedAccount}? მოთხოვნა დაიხურავს.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="payoutId" value={payoutId} />

      {generalError ? <Alert tone="error">{generalError}</Alert> : null}
      {fieldError ? <Alert tone="error">{fieldError}</Alert> : null}

      {iban ? (
        <>
          <dl className="grid gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">მიმღები</dt>
            <dd className="text-ink">{holderName}</dd>
            <dt className="text-ink-muted">IBAN</dt>
            <dd className="tabular break-all text-ink select-all">
              {groupIban(iban)}
            </dd>
            <dt className="text-ink-muted">თანხა</dt>
            <dd className="tabular text-ink">{amountLabel}</dd>
          </dl>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 sm:flex-none">
              <label
                htmlFor={`reference-${payoutId}`}
                className="mb-1 block text-xs font-medium text-ink-muted"
              >
                ბანკის რეფერენსი (არჩევითი)
              </label>
              <input
                id={`reference-${payoutId}`}
                name="reference"
                maxLength={100}
                autoComplete="off"
                className="tabular min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink sm:w-64"
              />
            </div>
            <Button
              type="submit"
              name="decision"
              value="PAID"
              size="sm"
              disabled={pending}
            >
              {pending ? 'მუშავდება…' : 'გადარიცხულია'}
            </Button>
          </div>
        </>
      ) : (
        <Alert tone="warning">
          ამ მოთხოვნის IBAN აღარ იხსნება. უარყავით და სთხოვეთ ავტორს
          მოთხოვნის ხელახლა შეტანა.
        </Alert>
      )}

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

/** Groups of four, the way a bank prints it and a person reads it back. */
function groupIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}
