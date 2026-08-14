'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Modal dialog, built on the native <dialog> element.
 *
 * `showModal()` gives us the things a hand-rolled overlay has to reimplement
 * badly: the top layer, so no z-index on the page can cover it; a real focus
 * trap; inert content behind it; Escape to close; and the ::backdrop
 * pseudo-element. The only thing added here is closing on a backdrop click,
 * which the element deliberately does not do by itself.
 *
 * The dialog is only mounted while open, so the form inside starts fresh each
 * time rather than showing the previous attempt's validation errors.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
    // The page behind must not scroll under the dialog on iOS.
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
      // Fires for Escape as well as for close(), so both paths tell the parent.
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // A click lands on the dialog itself only when it hit the backdrop:
        // anything inside is caught by a child first.
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-panel border border-line bg-surface p-0 text-ink shadow-panel backdrop:bg-ink/45"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="დახურვა"
          className="-m-2 inline-flex size-9 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
