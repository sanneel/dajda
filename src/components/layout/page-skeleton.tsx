/**
 * The outline a page shows while it loads: a title, a line of text, a panel.
 *
 * Page-agnostic on purpose. It stands in for every page behind a loading
 * boundary, so it promises a heading and some content, nothing more.
 */
export function PageSkeleton({
  className = 'mx-auto w-full max-w-page px-4 py-10 sm:px-6',
}: {
  className?: string;
}) {
  return (
    <div role="status" className={className}>
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
