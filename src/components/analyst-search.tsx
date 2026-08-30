'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * The ranking's search, folded behind an icon.
 *
 * The filter band was five stacked controls tall on a phone - the list the
 * page exists for started below the fold. Search is the control used least,
 * so it costs one icon until tapped; with a query already in the URL it
 * starts open, showing what the results are filtered by.
 */
export function AnalystSearch({ initialQuery }: { initialQuery: string }) {
  const [open, setOpen] = useState(initialQuery !== '');
  const inputRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (open && !opened.current) {
      opened.current = true;
      // `preventScroll` is the whole point: a plain focus() on a phone yanks
      // the page up to bring the input into view (and the keyboard shoves it
      // further), so opening search "bounced" the reader to the top. The band
      // is already on screen where they tapped - keep them there.
      if (initialQuery === '') inputRef.current?.focus({ preventScroll: true });
    }
    if (!open) opened.current = false;
  }, [open, initialQuery]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ანალიტიკოსის ძებნა"
        title="ძებნა"
        /*
         * Sits at the end of the row, after the selects: it is the control
         * used least, so it reads as a tool next to the submit button rather
         * than as the first thing the band asks for. Icon-sized, not
         * field-sized, for the same reason.
         */
        className="ml-auto inline-flex size-9 shrink-0 items-center justify-center self-end rounded-control text-on-band/70 transition-colors hover:bg-on-band/10 hover:text-on-band"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    // Full width, but NOT reordered to the top: the icon lives at the end of
    // the band, so the field it opens into belongs at the end too - appearing
    // right where the finger just tapped, with the keyboard rising under it,
    // instead of materialising in a different corner of the form.
    <div className="w-full">
      <label htmlFor="filter-q" className="sr-only">
        ანალიტიკოსის ძებნა
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-band/50"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="filter-q"
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder="ანალიტიკოსის სახელი"
          className="min-h-10 w-full rounded-control border border-on-band/20 bg-on-band/10 pl-9 pr-10 text-sm text-on-band transition-colors placeholder:text-on-band/50 focus:border-on-band/50 focus:outline-none"
        />
        {/*
         * Opening search costs one tap, so closing it should too - otherwise
         * the band keeps a row it no longer needs for the rest of the visit.
         */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="ძებნის დახურვა"
          className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-on-band/60 transition-colors hover:bg-on-band/10 hover:text-on-band"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
