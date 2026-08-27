'use client';

import { Children, useState, type ReactNode } from 'react';

/**
 * Renders the first `initial` children and a button for the rest.
 *
 * The children arrive ALREADY RENDERED from a server component and are only
 * sliced here, so anything redacted on the server (a locked pick, say) stays
 * redacted - this component never sees the data, just the output. One click
 * reveals everything; there is no paging within a feed, because a feed this
 * size hidden behind three clicks is worse than one long list.
 */
export function ShowMoreList({
  children,
  initial = 5,
  className,
}: {
  children: ReactNode;
  initial?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const shown = expanded ? items : items.slice(0, initial);

  return (
    <div>
      <ol className={className}>{shown}</ol>
      {!expanded && items.length > initial ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-control border border-line text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          მეტის ჩვენება ({items.length - initial})
        </button>
      ) : null}
    </div>
  );
}
