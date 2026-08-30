'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

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
      if (initialQuery === '') inputRef.current?.focus();
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
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-on-band/25 bg-on-band/10 text-on-band transition-colors hover:border-on-band/50"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="order-first w-full">
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
          className="min-h-11 w-full rounded-control border border-on-band/25 bg-on-band/10 pl-9 pr-3 text-sm text-on-band placeholder:text-on-band/50"
        />
      </div>
    </div>
  );
}
