'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/errors';

type ActionFn = (
  previous: ActionResult<never> | null,
  formData: FormData,
) => Promise<ActionResult<never>>;

/**
 * Small submit-only form for admin list rows.
 *
 * Each row posts its own <form> to a Server Action, so there is no client-side
 * mutation path and no shared client state to get out of sync.
 */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel = 'მუშავდება…',
  tone = 'neutral',
  confirm,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  tone?: 'neutral' | 'accent' | 'danger';
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action as ActionFn, null);

  const toneClass =
    tone === 'accent'
      ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
      : tone === 'danger'
        ? 'border-loss/40 text-loss hover:bg-loss/10'
        : 'border-line text-ink-muted hover:text-ink hover:border-line-strong';

  return (
    <form
      action={formAction}
      className="inline-block"
      onSubmit={(event) => {
        // Native confirm keeps destructive admin actions one deliberate step
        // away without pulling in a modal dependency.
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors disabled:opacity-45 ${toneClass}`}
      >
        {pending ? pendingLabel : label}
      </button>

      {state && !state.ok ? (
        <span className="ml-2 text-xs text-loss">{state.error.message}</span>
      ) : null}
    </form>
  );
}
