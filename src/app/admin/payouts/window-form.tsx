'use client';

import { useActionState, useState } from 'react';
import { setPayoutWindowAction } from '@/actions/payouts';
import { Input } from '@/components/ui/field';

/**
 * One author's withdrawal window, as three choices.
 *
 * A single "unlock" toggle would have been shorter and wrong: there are three
 * states here, not two. Back on the calendar is not the same as held shut,
 * and an administrator who opens a window early needs to be able to put the
 * author back on the agreement's rule afterwards without that reading as a
 * punishment.
 *
 * The reason field appears only for the two overrides, because SCHEDULE is
 * the state that needs no explaining. It is required by the schema, so the
 * button for an override stays disabled until something is typed - the
 * refusal would otherwise arrive after the click, for a field that was not
 * even on screen a moment ago.
 */
type Window = 'SCHEDULE' | 'OPEN' | 'CLOSED';

const OPTIONS: { value: Window; label: string; hint: string }[] = [
  { value: 'SCHEDULE', label: 'გრაფიკით', hint: 'თვის ბოლო დღეს' },
  { value: 'OPEN', label: 'ღიაა', hint: 'ნებისმიერ დღეს' },
  { value: 'CLOSED', label: 'შეჩერებული', hint: 'ბოლო დღესაც არა' },
];

export function PayoutWindowForm({
  analystProfileId,
  current,
  note,
}: {
  analystProfileId: string;
  current: Window;
  /** The reason recorded with the current override, if it is on one. */
  note: string | null;
}) {
  const [state, action, pending] = useActionState(setPayoutWindowAction, null);
  const [choice, setChoice] = useState<Window>(current);
  const [reason, setReason] = useState(note ?? '');

  const noteError = state && !state.ok ? state.error.fieldErrors?.note?.[0] : undefined;
  const generalError =
    state && !state.ok && !state.error.fieldErrors ? state.error.message : null;

  const needsReason = choice !== 'SCHEDULE';
  const unchanged = choice === current && (!needsReason || reason === (note ?? ''));

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="analystProfileId" value={analystProfileId} />
      <input type="hidden" name="window" value={choice} />

      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => {
          const selected = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setChoice(option.value)}
              title={option.hint}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors ${
                selected
                  ? option.value === 'CLOSED'
                    ? 'border-loss/50 bg-loss/10 text-loss'
                    : 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {needsReason ? (
        <div>
          <label htmlFor={`note-${analystProfileId}`} className="sr-only">
            მიზეზი
          </label>
          <Input
            id={`note-${analystProfileId}`}
            name="note"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="მიზეზი: რატომ, და ვის შეთანხმებით"
            error={Boolean(noteError)}
          />
          {noteError ? (
            <p className="mt-1 text-xs text-loss" role="alert">
              {noteError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || unchanged || (needsReason && reason.trim().length < 3)}
          className="inline-flex min-h-9 items-center rounded-md border border-line px-3 text-sm text-ink transition-colors hover:border-line-strong disabled:opacity-40"
        >
          {pending ? 'ინახება…' : 'შენახვა'}
        </button>
        {state?.ok ? (
          <span className="text-xs text-ink-muted">შენახულია.</span>
        ) : null}
        {generalError ? (
          <span className="text-xs text-loss">{generalError}</span>
        ) : null}
      </div>
    </form>
  );
}
