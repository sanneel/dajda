'use client';

import { useLinkStatus } from 'next/link';

/**
 * The clicked nav link's own underline, drawn the moment it is clicked.
 *
 * When a page is not prefetched yet, navigation waits on the server, and
 * without this nothing on screen answered the click. Must render inside the
 * <Link> it reports on; the link needs `relative`. Hidden from assistive
 * technology: the route change itself is what gets announced.
 */
export function LinkPending({ className }: { className: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute transition-opacity motion-reduce:transition-none ${
        pending ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    />
  );
}
