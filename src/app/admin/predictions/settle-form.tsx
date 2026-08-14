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
 * A settlement source is mandatory: a result is only meaningful if it can be
 * traced to where it came from.
 */
export function SettleForm({ predictionId }: { predictionId: string }) {
  const [open, setOpen] = useState(false);
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

  return (
    <form action={action} className="space-y-3 rounded border border-line bg-canvas p-3">
      <input type="hidden" name="predictionId" value={predictionId} />

      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`outcome-${predictionId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            შედეგი
          </label>
          <select
            id={`outcome-${predictionId}`}
            name="outcome"
            required
            className="min-h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink"
          >
            {OUTCOMES.map((outcome) => (
              <option key={outcome.value} value={outcome.value}>
                {outcome.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`actual-${predictionId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            ფაქტობრივი მნიშვნელობა
          </label>
          <input
            id={`actual-${predictionId}`}
            name="actualValue"
            type="number"
            step="0.01"
            inputMode="decimal"
            className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 text-sm text-ink"
          />
        </div>

        <div>
          <label
            htmlFor={`source-${predictionId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            წყარო (სავალდებულო)
          </label>
          <input
            id={`source-${predictionId}`}
            name="settlementSource"
            required
            minLength={3}
            placeholder="მაგ: ლიგის ოფიციალური ოქმი"
            className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 text-sm text-ink"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'ინახება…' : 'დაფიქსირება'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          გაუქმება
        </Button>
      </div>
    </form>
  );
}
