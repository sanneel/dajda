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
 * no "beside", so it is a centred card - see the class list for why it is no
 * longer a bottom sheet.
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
         * Phone: a centred card, and deliberately nothing clever.
         *
         * It used to be a sheet pinned to the bottom with `position: fixed`,
         * `top: auto` and a height in `dvh`. On desktop and in Chrome on a
         * phone-sized window that renders perfectly; on iOS Safari it painted
         * the backdrop and no sheet at all - the page dimmed and the composer
         * was simply not there. Anchoring by `bottom` and sizing by `dvh` are
         * both awkward inside the top layer, and a composer that cannot be
         * opened on a phone is worse than one that is not thumb-anchored.
         *
         * So the mobile path now uses only what every browser has agreed on
         * for years: the dialog centres itself with `margin: auto` and is
         * capped in `vh`. The UA's own `max-width: calc(100% - 2em)` is
         * replaced rather than fought, so the card is symmetrical.
         */
        'm-auto w-[calc(100%-2rem)] max-w-[26rem] max-h-[80vh]',
        'overscroll-contain rounded-panel border border-line bg-surface p-0 text-ink shadow-panel',
        /*
         * Desktop keeps the right-hand column: the workspace the composer was
         * launched from stays visible beside it, which is the whole reason
         * this is a drawer and not a modal.
         */
        'sm:fixed sm:inset-y-0 sm:left-auto sm:right-0 sm:m-0 sm:h-full sm:max-h-none',
        'sm:w-[30rem] sm:max-w-[92vw] sm:rounded-none sm:rounded-l-panel',
        'backdrop:bg-ink/50',
      ].join(' ')}
    >
      {/* The cap is repeated here so the body below can be the part that
          scrolls: a flex child only knows how tall it may be if its parent
          does. */}
      <div className="flex max-h-[80vh] flex-col sm:h-full sm:max-h-none">
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
