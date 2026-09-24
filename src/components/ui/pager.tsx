import Link from 'next/link';

/**
 * Previous / "n of m" / next, for a server-paginated list. Renders nothing
 * when everything fits on one page. `hrefFor` builds the link for a page
 * number, so each list keeps its own filters in the query string.
 */
export function Pager({
  page,
  pageCount,
  hrefFor,
  className = 'mt-8 flex items-center justify-between gap-4 text-sm',
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className={className} aria-label="გვერდები">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="text-ink hover:text-accent">
          წინა
        </Link>
      ) : (
        <span className="text-ink-faint">წინა</span>
      )}
      <span className="tabular text-ink-muted">
        {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="text-ink hover:text-accent">
          შემდეგი
        </Link>
      ) : (
        <span className="text-ink-faint">შემდეგი</span>
      )}
    </nav>
  );
}
