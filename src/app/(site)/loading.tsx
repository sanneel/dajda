/**
 * What a reader sees between clicking a link and the page arriving.
 *
 * Every page here is rendered on request, and the server is an ocean away
 * from most readers, so a click used to leave the old page up, unchanged,
 * for as long as that took. This is the page's outline instead: the header
 * and nav stay (they belong to the layout above), the body is swapped for
 * a title and a panel at once, and Next prefetches this file so the swap
 * needs no round trip.
 *
 * Deliberately plain and page-agnostic: it covers every public page, so it
 * promises a heading and some content, nothing more specific.
 */
export default function Loading() {
  return (
    <div
      role="status"
      className="mx-auto max-w-page px-4 py-10 sm:px-6"
    >
      <span className="sr-only">იტვირთება…</span>
      <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
        <div className="h-9 w-64 max-w-full rounded-control bg-elevated" />
        <div className="mt-4 h-4 w-full max-w-xl rounded-control bg-elevated" />
        <div className="mt-2 h-4 w-2/3 max-w-md rounded-control bg-elevated" />
        <div className="mt-10 h-64 rounded-panel bg-surface" />
      </div>
    </div>
  );
}
