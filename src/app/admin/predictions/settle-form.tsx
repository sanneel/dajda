'use client';

import { useActionState, useState } from 'react';
import { settlePredictionAction } from '@/actions/admin';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';

const OUTCOMES = [
  { value: 'WON', label: 'დაჯდა' },
  { value: 'LOST', label: 'ვერ დაჯდა' },
  { value: 'VOID', label: 'ბათილი' },
  { value: 'PUSH', label: 'დაბრუნებული' },
];

/**
 * Settlement form.
 *
 * Two things are deliberate about its shape:
 *
 *   1. The outcome is a row of four chips with NOTHING preselected. A select
 *      that opened on "დაჯდა" let an admin type a source, press the button and
 *      record a win they never chose. Now the verdict is a click of its own.
 *   2. The source is mandatory and the only other required field. A result is
 *      only meaningful if it can be traced to where it came from; the actual
 *      value is for totals and lines, and says so.
 *
 * On the queue page the form is open from the start, because settling IS the
 * task there; in the bet browser it stays behind a button so a list of
 * history does not sprout forty forms.
 */
export function SettleForm({
  predictionId,
  defaultOpen = false,
}: {
  predictionId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState(settlePredictionAction, null);

  if (state?.ok) {
    return <Alert tone="success">შედეგი დაფიქსირდა.</Alert>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        შედეგის დაფიქსირება
      </button>
    );
  }

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form
      action={action}
      className="space-y-3 rounded-card border border-line bg-canvas p-3"
    >
      <input type="hidden" name="predictionId" value={predictionId} />

      {state && !state.ok && !fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 block text-xs font-medium text-ink-muted">
          შედეგი
        </legend>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((outcome) => (
            <label
              key={outcome.value}
              className="relative inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent"
            >
              <input
                type="radio"
                name="outcome"
                value={outcome.value}
                required
                className="sr-only"
              />
              {outcome.label}
            </label>
          ))}
        </div>
        {fieldErrors?.outcome?.[0] ? (
          <p className="mt-1 text-xs text-loss" role="alert">
            {fieldErrors.outcome[0]}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,12rem)]">
        <div>
          <label
            htmlFor={`source-${predictionId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            წყარო
          </label>
          <input
            id={`source-${predictionId}`}
            name="settlementSource"
            required
            minLength={3}
            placeholder="მაგ: ლიგის ოფიციალური ოქმი, sofascore"
            aria-invalid={fieldErrors?.settlementSource ? true : undefined}
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          />
          {fieldErrors?.settlementSource?.[0] ? (
            <p className="mt-1 text-xs text-loss" role="alert">
              {fieldErrors.settlementSource[0]}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={`actual-${predictionId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            ფაქტობრივი მნიშვნელობა{' '}
            <span className="font-normal text-ink-faint">(არასავალდებულო)</span>
          </label>
          <input
            id={`actual-${predictionId}`}
            name="actualValue"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="ტოტალი, ხაზი"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'ინახება…' : 'დაფიქსირება'}
        </Button>
        {!defaultOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            გაუქმება
          </Button>
        ) : null}
      </div>
    </form>
  );
}
