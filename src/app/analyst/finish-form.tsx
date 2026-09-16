'use client';

import { useActionState, useState } from 'react';
import { markBetFinishedAction } from '@/actions/analyst';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/*
 * Two outcomes, worded as the settlement form words them, because the admin
 * is checking the author's answer against the slip and the two should read
 * the same. A returned stake is not offered: that is a judgement about the
 * bookmaker's own settlement, and it stays the administrator's.
 */
const CLAIMS = [
  { value: 'WON', label: 'დაჯდა' },
  { value: 'LOST', label: 'არ დაჯდა' },
];

/**
 * Hand a finished bet to an admin.
 *
 * The author says which way it went. They know and the administrator does
 * not, so a handover that carried only "it is over" sent somebody to read a
 * slip cold. It stays a claim: the verdict, the record and the units are all
 * written by the admin afterwards, against this and the screenshot.
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

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">
          როგორ დამთავრდა?
        </legend>
        <div className="flex flex-wrap gap-2">
          {CLAIMS.map((claim) => (
            <label
              key={claim.value}
              className="relative inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent"
            >
              <input
                type="radio"
                name="claimedOutcome"
                value={claim.value}
                required
                className="sr-only"
              />
              {claim.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          საბოლოო შედეგს ადმინი ადასტურებს სკრინშოტის მიხედვით.
        </p>
      </fieldset>

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
