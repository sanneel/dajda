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
 * The shape is what differs. A composer is a task, not a message: on a phone
 * it rises from the bottom as a sheet the thumb can reach, and on a desktop it
 * takes a right-hand column so the workspace it was launched from stays
 * visible behind it. A centred modal would do neither.
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
         * Phone: a sheet anchored to the bottom, capped so the page behind
         * stays partly visible and the drawer never feels like a new page.
         *
         * The browser's own dialog styles fight this and have to be undone
         * explicitly: `margin: auto` (would float the sheet), a max-width of
         * "100% minus 2em" (left a 38px gap on the right edge), and a
         * max-height in `vh`, which on iPhone Safari is the height BEHIND the
         * toolbars, so a `vh`-sized sheet had its top pushed out of view.
         * `dvh` is the height the reader actually sees.
         */
        'fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[88dvh]',
        'overscroll-contain rounded-t-panel border border-line bg-surface p-0 text-ink shadow-panel',
        // Desktop: a full-height column on the right.
        'sm:bottom-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none',
        'sm:w-[30rem] sm:max-w-[92vw] sm:rounded-none sm:rounded-l-panel',
        'backdrop:bg-ink/50',
      ].join(' ')}
    >
      <div className="flex h-full max-h-[88dvh] flex-col sm:max-h-none">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </dialog>
  );
}
