'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { updateProfileAction } from '@/actions/account';
import { Avatar } from '@/components/ui/avatar';
import { NAME_LOCKED_KA } from '@/lib/account/identity';

/**
 * Who you are, and the one field of it you may change.
 *
 * This was a page of its own with a form and a save button, for a single text
 * input beside an email that cannot be edited at all. The name is now edited
 * where it is displayed: press the pencil, type, Enter saves and Escape puts
 * the old value back. Nothing is held unsaved, so there is nothing to lose by
 * navigating away - which is exactly how the old form lost edits.
 *
 * The email is text, not a disabled input. A greyed-out field still reads as
 * something you could type in, and it is not.
 */
export function IdentityRow({
  name,
  email,
  photoPath = null,
  nameLocked = false,
}: {
  name: string;
  email: string;
  photoPath?: string | null;
  /** An analyst's name was checked against a document; see lib/account/identity. */
  nameLocked?: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The server is the source of truth for what the name IS; this only holds
  // what is being typed.
  const [draft, setDraft] = useState(name);

  /*
   * Also on every result, not only on opening. A refused save leaves the
   * focus on the button, where Escape reaches nothing and the person has to
   * click back into the field to correct the value they just typed.
   */
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing, state]);

  /*
   * A refused edit keeps the field open with the message under it; an
   * accepted one closes. Adjusted during render rather than in an effect:
   * the editor must already be shut on the paint that shows the new name,
   * and an effect would flash the input for a frame first.
   */
  const [lastResult, setLastResult] = useState(state);
  if (state !== lastResult) {
    setLastResult(state);
    if (state?.ok) setEditing(false);
  }

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const error = state && !state.ok ? state.error : null;

  return (
    <header className="flex items-start gap-3">
      <Avatar name={name} src={photoPath} size="md" />

      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            ref={formRef}
            action={action}
            className="flex flex-col gap-1.5"
            /*
             * On the form, not on the input: after a refused save the focus
             * is on the button, and an Escape handler that only listens to
             * the field leaves the editor with no way out but the mouse.
             */
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                id="name"
                name="name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="სახელი"
                aria-invalid={error ? true : undefined}
                className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-3 text-base text-ink"
              />
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-control bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-45"
              >
                {pending ? 'ინახება…' : 'შენახვა'}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 rounded-control px-3 text-sm text-ink-muted hover:text-ink"
              >
                გაუქმება
              </button>
            </div>
            {error ? (
              <p className="text-xs text-loss" role="alert">
                {error.fieldErrors?.name?.[0] ?? error.message}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate font-display text-lg text-ink">{name}</h1>
            {nameLocked ? (
              <span className="text-xs text-ink-faint" title={NAME_LOCKED_KA}>
                დამოწმებული
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="სახელის შეცვლა"
                className="inline-flex size-9 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-elevated hover:text-ink"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {state?.ok ? (
              <span className="text-xs text-ink-muted" role="status">
                შენახულია.
              </span>
            ) : null}
          </div>
        )}

        <p className="truncate text-sm text-ink-muted">{email}</p>
        {nameLocked ? (
          <p className="mt-1 text-xs text-ink-faint">{NAME_LOCKED_KA}</p>
        ) : null}
      </div>
    </header>
  );
}
