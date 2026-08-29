'use client';

import { useActionState, useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportReason } from '@/generated/prisma/enums';
import { REPORT_REASON_KA } from '@/lib/labels';
import { submitReport } from '@/actions/reports';
import { Alert } from './ui/feedback';
import { Button } from './ui/button';

/**
 * Report control.
 *
 * Collapsed by default so it never competes with the content, and rendered as
 * a real <form> posting to a Server Action so it degrades gracefully.
 */
export function ReportForm({
  targetType,
  targetId,
  label = 'პრობლემის დაფიქსირება',
}: {
  targetType: 'ANALYST' | 'PREDICTION';
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitReport, null);

  if (state?.ok) {
    return (
      <Alert tone="success">
        საჩივარი მიღებულია. მოდერაცია განიხილავს.
      </Alert>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-muted transition-colors hover:text-loss"
      >
        <Flag className="size-4" aria-hidden="true" />
        {label}
      </button>

      {open ? (
        <form
          action={action}
          className="mt-3 space-y-3"
      // Let the explicit success reset through; block React 19's automatic
      // reset when the action failed, so an error never wipes the draft.
      onReset={(event) => {
        if (state && !state.ok) event.preventDefault();
      }}
        >
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />

          <div>
            <label
              htmlFor="report-reason"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              მიზეზი
            </label>
            <select
              id="report-reason"
              name="reason"
              required
              className="min-h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink"
            >
              {Object.values(ReportReason).map((reason) => (
                <option key={reason} value={reason}>
                  {REPORT_REASON_KA[reason]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-details"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              დამატებითი ინფორმაცია
            </label>
            <textarea
              id="report-details"
              name="details"
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-base text-ink"
            />
          </div>

          {state && !state.ok ? (
            <Alert tone="error">{state.error.message}</Alert>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'იგზავნება…' : 'გაგზავნა'}
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
      ) : null}
    </div>
  );
}
