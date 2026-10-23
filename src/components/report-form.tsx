'use client';

import { useActionState, useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportReason } from '@/generated/prisma/enums';
import { REPORT_REASON_KA } from '@/lib/labels';
import { submitReport } from '@/actions/reports';
import { Alert } from './ui/feedback';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

/**
 * Report control.
 *
 * Collapsed by default so it never competes with the content, and rendered as
 * a real <form> posting to a Server Action so it degrades gracefully. The
 * button variant is a bordered button that opens the form in a dialog, for
 * a row of header actions.
 */
export function ReportForm({
  targetType,
  targetId,
  label = 'პრობლემის დაფიქსირება',
  variant = 'inline',
}: {
  targetType: 'ANALYST' | 'PREDICTION';
  targetId: string;
  label?: string;
  variant?: 'inline' | 'button';
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitReport, null);

  if (variant === 'button') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-loss hover:text-loss"
        >
          <Flag className="size-4" aria-hidden="true" />
          {label}
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title={label}>
          {state?.ok ? (
            <Alert tone="success">
              საჩივარი მიღებულია. მოდერაცია განიხილავს.
            </Alert>
          ) : (
            <ReportFields
              action={action}
              pending={pending}
              error={state && !state.ok ? state.error.message : null}
              targetType={targetType}
              targetId={targetId}
              onCancel={() => setOpen(false)}
            />
          )}
        </Modal>
      </>
    );
  }

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
        <div className="mt-3">
          <ReportFields
            action={action}
            pending={pending}
            error={state && !state.ok ? state.error.message : null}
            targetType={targetType}
            targetId={targetId}
            onCancel={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReportFields({
  action,
  pending,
  error,
  targetType,
  targetId,
  onCancel,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  targetType: 'ANALYST' | 'PREDICTION';
  targetId: string;
  onCancel: () => void;
}) {
  return (
    <form
      action={action}
      className="space-y-3"
      // Let the explicit success reset through; block React 19's automatic
      // reset when the action failed, so an error never wipes the draft.
      onReset={(event) => {
        if (error) event.preventDefault();
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

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'იგზავნება…' : 'გაგზავნა'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          გაუქმება
        </Button>
      </div>
    </form>
  );
}
