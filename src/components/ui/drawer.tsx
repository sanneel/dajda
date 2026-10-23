'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Side drawer, built on the native <dialog> element.
 *
 * Same reasoning as `Modal`: showModal() supplies the top layer, a real focus
 * trap, inert content behind, Escape-to-close and a ::backdrop, none of which
 * a hand-rolled overlay gets right for free.
 *
 * The shape is what differs. On a desktop it takes a right-hand column, so the
 * workspace it was launched from stays visible beside it. On a phone there is
 * no "beside", so it takes the whole screen.
 *
 * Mounted only while open, so a form inside starts clean each time instead of
 * showing the previous attempt's errors.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // Only a backdrop hit lands on the dialog itself; anything inside is
        // caught by a child first.
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className={[
        /*
         * Phone: the whole screen. A centred card left the page showing
         * around it and cut the form off above the tab bar. The dialog is
         * already fixed to the viewport by the UA, so lifting the size caps
         * fills it without anchoring by `bottom` or sizing in `dvh`, the two
         * things iOS Safari failed to paint inside the top layer.
         */
        'm-0 size-full max-h-none max-w-none',
        'overscroll-contain border-line bg-surface p-0 text-ink',
        /*
         * Desktop keeps the right-hand column: the workspace the composer was
         * launched from stays visible beside it, which is the whole reason
         * this is a drawer and not a modal.
         */
        'sm:fixed sm:inset-y-0 sm:left-auto sm:right-0 sm:border-l',
        'sm:w-[30rem] sm:max-w-[92vw] sm:rounded-l-panel sm:shadow-panel',
        'backdrop:bg-ink/50',
      ].join(' ')}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-ink">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="დახურვა"
            className="-m-2 inline-flex size-9 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </dialog>
  );
}
