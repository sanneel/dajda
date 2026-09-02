'use client';

import { useActionState } from 'react';
import { resolveReportAction } from '@/actions/admin';
import { Alert } from '@/components/ui/feedback';

/**
 * Deciding a report.
 *
 * One form, three verdicts, one optional note. The note used to have nowhere
 * to go: the action accepted it and the page displayed it, but the buttons
 * posted without it, so every closed report read as a bare status. Now the
 * admin can say in a line why a report was closed or dismissed, and that line
 * is what the reports page shows afterwards.
 *
 * "განხილვაში" is for the case where the answer is not yet known: it takes
 * the report out of the open pile without pretending it was decided.
 */
export function ReportDecisionForm({
  reportId,
  status,
}: {
  reportId: string;
  status: 'OPEN' | 'REVIEWING';
}) {
  const [state, action, pending] = useActionState(resolveReportAction, null);

  if (state?.ok) {
    return <Alert tone="success">საჩივარი დამუშავდა.</Alert>;
  }

  const button =
    'inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors disabled:opacity-45';

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reportId" value={reportId} />

      <label htmlFor={`note-${reportId}`} className="sr-only">
        შენიშვნა
      </label>
      <input
        id={`note-${reportId}`}
        name="resolutionNote"
        maxLength={1000}
        placeholder="შენიშვნა (არასავალდებულო)"
        className="min-h-11 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-ink sm:w-64"
      />

      {status === 'OPEN' ? (
        <button
          type="submit"
          name="status"
          value="REVIEWING"
          disabled={pending}
          className={`${button} border-line text-ink-muted hover:border-line-strong hover:text-ink`}
        >
          განხილვაში
        </button>
      ) : null}
      <button
        type="submit"
        name="status"
        value="RESOLVED"
        disabled={pending}
        className={`${button} border-accent/40 bg-accent/10 text-accent hover:bg-accent/20`}
      >
        {pending ? 'მუშავდება…' : 'დახურვა'}
      </button>
      <button
        type="submit"
        name="status"
        value="DISMISSED"
        disabled={pending}
        className={`${button} border-loss/40 text-loss hover:bg-loss/10`}
      >
        უარყოფა
      </button>

      {state && !state.ok ? (
        <span className="basis-full text-xs text-loss" role="alert">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}
