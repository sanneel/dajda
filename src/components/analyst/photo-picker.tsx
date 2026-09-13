'use client';

import { useActionState, useRef } from 'react';
import { Camera } from 'lucide-react';
import { updateAnalystPhotoAction } from '@/actions/analyst';
import { Avatar } from '@/components/ui/avatar';

/**
 * The author's own photograph, as a control.
 *
 * The picture IS the button: clicking it opens the file browser and choosing
 * a file submits, because there is nothing to confirm - a photograph is
 * judged by looking at it, and it can be replaced again in the same gesture.
 * A separate "upload" form with its own save button asked for two decisions
 * where there is one.
 *
 * It renders as a plain avatar for everyone who is not the owner, so the
 * profile page does not need two branches around it.
 */
export function AnalystPhotoPicker({
  name,
  photoPath,
  size = 'lg',
  editable = true,
}: {
  name: string;
  photoPath: string | null;
  size?: 'md' | 'lg';
  /** False for a visitor: the same picture, with no control attached. */
  editable?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    updateAnalystPhotoAction,
    null,
  );

  if (!editable) return <Avatar name={name} src={photoPath} size={size} />;

  const error = state && !state.ok ? state.error : null;

  return (
    <div className="shrink-0">
      <form action={action} ref={formRef}>
        <label
          className="group relative block cursor-pointer rounded-full"
          title="ფოტოს შეცვლა"
        >
          <Avatar name={name} src={photoPath} size={size} />

          {/*
           * Always visible, not hover-only: on a touch screen there is no
           * hover, and an author who cannot see that the picture is a control
           * will never press it.
           */}
          <span
            className="absolute -bottom-0.5 -right-0.5 inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors group-hover:border-ink-faint group-hover:text-ink"
            aria-hidden="true"
          >
            {pending ? (
              <span className="size-3 animate-pulse rounded-full bg-accent" />
            ) : (
              <Camera className="size-3.5" />
            )}
          </span>

          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => {
              if (event.target.files?.length) formRef.current?.requestSubmit();
            }}
            className="sr-only"
          />
          <span className="sr-only">ფოტოს შეცვლა</span>
        </label>
      </form>

      {error ? (
        <p className="mt-2 max-w-40 text-xs text-loss" role="alert">
          {error.fieldErrors?.photo?.[0] ?? error.message}
        </p>
      ) : null}
    </div>
  );
}
