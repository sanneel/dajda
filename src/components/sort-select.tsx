'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

export type SortOption = {
  value: string;
  label: string;
  /** What the ordering actually keys on. Shown in the menu; not decoration. */
  hintKa: string;
  /** Built on the server, so the URL rules live in exactly one place. */
  href: string;
};

/**
 * The feed's order.
 *
 * Two decisions here come from the product rather than from a component
 * library, and both are worth stating.
 *
 * It is not a native <select>. The closed control would be fine either way,
 * but the open list is drawn by the operating system, and this menu's whole
 * point is the second line under each option: a feed can be ordered by when a
 * bet starts or by whose record earned the most, and those are different
 * questions, not different words. This product explains every number it
 * prints, so explaining the ordering is the same promise. An OS menu cannot
 * carry it.
 *
 * It is not a floating rounded card with a drop shadow either. The surfaces
 * that hold a record here are near-square ruled tables (see the radius
 * tokens), so the menu is one too: square corners, hairlines between rows, and
 * a hard ink edge joining it to the trigger instead of a shadow - which the
 * dark palette has no way to draw anyway. The selected row carries a left ink
 * rule, the device the live-session feed already uses, rather than a check.
 *
 * Everything the native element gave for free is re-implemented rather than
 * dropped: listbox semantics, full keyboard control, focus return, and close
 * on Escape or an outside click.
 */
export function SortSelect({
  value,
  options,
}: {
  value: string;
  options: SortOption[];
}) {
  const router = useRouter();
  const baseId = useId();

  const indexOfValue = () =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(indexOfValue);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  // Moving focus into the list is what makes the arrow keys land somewhere.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  /*
   * A press anywhere else closes the menu. Bound to pointerdown rather than
   * click so the menu is gone before whatever was pressed reacts; a menu that
   * lingers over the thing you just hit reads as a stuck overlay.
   */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    close();
    if (option.value !== value) router.push(option.href);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((current) => (current + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((current) => (current - 1 + options.length) % options.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // Let focus leave, but do not leave a menu hanging behind it.
        close(false);
        break;
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(indexOfValue());
      setOpen(true);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <span id={baseId + '-label'} className="sr-only">
        სორტირება
      </span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={baseId + '-label ' + baseId + '-value'}
        onClick={() => {
          setActive(indexOfValue());
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
        /*
         * Open turns the trigger into the band colour - the token this system
         * already reserves for "the controls above a list". The open state
         * becomes unmistakable without inventing a new accent, and the trigger
         * reads as part of the panel dropping out of it.
         */
        className={
          'inline-flex min-h-9 items-center gap-2 rounded-control border px-3 text-sm transition-colors ' +
          (open
            ? 'border-band bg-band text-on-band'
            : 'border-line-strong bg-surface text-ink hover:border-ink-faint hover:bg-elevated')
        }
      >
        <span className={open ? 'text-xs text-on-band/70' : 'text-xs text-ink-faint'}>
          სორტირება
        </span>
        <span
          aria-hidden="true"
          className={'h-3.5 w-px ' + (open ? 'bg-on-band/30' : 'bg-line-strong')}
        />
        <span id={baseId + '-value'} className="font-medium">
          {selected?.label}
        </span>
        <Caret open={open} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={baseId + '-label'}
          aria-activedescendant={baseId + '-option-' + active}
          onKeyDown={onListKeyDown}
          /*
           * Right-aligned: the control sits at the end of the toolbar, so a
           * left-aligned menu would hang off the edge on a narrow screen. The
           * ink edge on top is the join to the trigger, standing in for the
           * shadow this palette cannot draw in dark.
           */
          className="absolute right-0 top-full z-20 mt-1.5 w-72 max-w-[calc(100vw-2rem)] border-t-2 border-ink bg-surface outline-none ring-1 ring-line"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === active;

            return (
              <li
                key={option.value}
                id={baseId + '-option-' + index}
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(index)}
                onPointerEnter={() => setActive(index)}
                className={
                  'cursor-pointer border-l-2 px-3.5 py-2.5 transition-colors ' +
                  '[&+&]:border-t [&+&]:border-t-line ' +
                  (isSelected ? 'border-l-ink ' : 'border-l-transparent ') +
                  (isActive ? 'bg-elevated' : 'bg-surface')
                }
              >
                <span
                  className={
                    'block text-sm ' +
                    (isSelected
                      ? 'font-semibold text-ink'
                      : 'text-ink-muted')
                  }
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {option.hintKa}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Two strokes, drawn to match the hairlines rather than imported as an icon. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden="true"
      className={
        'ml-0.5 h-1.5 w-2.5 transition-transform ' + (open ? 'rotate-180' : '')
      }
    >
      <path
        d="M1 1L5 5L9 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}
