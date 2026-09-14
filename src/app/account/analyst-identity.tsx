'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { updateAnalystDisplayNameAction } from '@/actions/analyst';
import { AnalystPhotoPicker } from '@/components/analyst/photo-picker';

/**
 * The author's public identity: the picture readers see and the name under it.
 *
 * Separate from the row above it, which is the account holder's legal name and
 * is locked because an administrator checked it against a document. These two
 * are different things that happen to both be called "name", and putting them
 * side by side is what makes that legible: one says who signed up, the other
 * says who publishes.
 *
 * Edited the same way as the legal name is displayed - press the pencil, type,
 * Enter saves, Escape restores - so the page has one editing gesture rather
 * than one per field.
 */
export function AnalystIdentity({
  displayName,
  photoPath,
  slug,
}: {
  displayName: string;
  photoPath: string | null;
  slug: string;
}) {
  const [state, action, pending] = useActionState(
    updateAnalystDisplayNameAction,
    null,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * The server owns what the name IS. A save that succeeded closes the editor
   * and a refused one leaves it open with the text still there, which is the
   * only way to correct it without retyping.
   */
  const [lastResult, setLastResult] = useState(state);
  if (state !== lastResult) {
    setLastResult(state);
    if (state?.ok) setEditing(false);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing, state]);

  const shown = state?.ok ? state.data.displayName : displayName;
  const error = state && !state.ok ? state.error : null;

  return (
    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <AnalystPhotoPicker name={shown} photoPath={photoPath} size="md" />

        <div className="min-w-0 flex-1">
          <p className="rule-label">საჯარო სახელი</p>

          {editing ? (
            <form
              action={action}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setDraft(shown);
                  setEditing(false);
                }
              }}
              className="mt-1 flex flex-wrap items-center gap-2"
            >
              <input
                ref={inputRef}
                name="displayName"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                required
                minLength={2}
                maxLength={60}
                aria-label="საჯარო სახელი"
                aria-invalid={error ? true : undefined}
                className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 text-base text-ink"
              />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-accent hover:underline"
              >
                {pending ? 'ინახება…' : 'შენახვა'}
              </button>
            </form>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-base font-medium text-ink">
                {shown}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraft(shown);
                  setEditing(true);
                }}
                aria-label="საჯარო სახელის შეცვლა"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-elevated hover:text-ink"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {error ? (
            <p className="mt-1 text-xs text-loss" role="alert">
              {error.fieldErrors?.displayName?.[0] ?? error.message}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
        ფოტოს შესაცვლელად დააჭირეთ თავად ფოტოს. თქვენი გვერდის მისამართი{' '}
        <span className="tabular">/analysts/{slug}</span> სახელის შეცვლით არ
        იცვლება — ძველი ბმულები მუშაობს.
      </p>
    </div>
  );
}
