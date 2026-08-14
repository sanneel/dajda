'use client';

import { useActionState, useState } from 'react';
import { markBetFinishedAction } from '@/actions/analyst';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Hand a finished bet to an admin.
 *
 * The result screenshot is optional and the copy says so, because an author
 * who cannot find their slip should still be able to close the bet rather than
 * leaving it open forever. Without the image an admin verifies by hand, which
 * is slower for everyone; the form nudges without blocking.
 */
export function FinishBetForm({ predictionId }: { predictionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markBetFinishedAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success">
        გაიგზავნა განსახილველად. შედეგს ადმინი დაადასტურებს.
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        დასრულებულად მონიშვნა
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-card border border-line bg-canvas p-3"
    >
      <input type="hidden" name="predictionId" value={predictionId} />

      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <div>
        <label
          htmlFor={`result-${predictionId}`}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          შედეგის სკრინშოტი
        </label>
        <input
          id={`result-${predictionId}`}
          name="resultScreenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="w-full rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          არასავალდებულო, მაგრამ ამით განხილვა ბევრად სწრაფია. მის გარეშე
          ადმინი ხელით ამოწმებს.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'იგზავნება…' : 'დასრულება'}
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
