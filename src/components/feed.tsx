import Link from 'next/link';
import type { FeedEntry } from '@/lib/queries/feed';
import { formatDateTimeKa, formatOdds, formatUnitsSigned } from '@/lib/format';
import { Avatar } from './ui/avatar';
import { StatusBadge } from './ui/badge';
import { ShowMoreList } from './ui/show-more';
import { SportTile } from './sport-tile';

/**
 * An analyst's feed.
 *
 * Posts and bets share one timeline but never share a shape: a bet is a card
 * with a slip and a result, a post is text. Reading down the column it has to
 * stay obvious which is which, because only one of the two counts toward the
 * record the reader is here to check.
 */
export function Feed({
  entries,
  emptyText = 'ჯერ არაფერია.',
  lockedBetIds,
  showAuthor = false,
}: {
  entries: FeedEntry[];
  emptyText?: string;
  /**
   * Bets whose pick this viewer has not paid for. The entry stays in the
   * timeline (odds, status, date), but the title and the slip are withheld.
   * Decided by the caller, because only the page knows who is looking.
   */
  lockedBetIds?: ReadonlySet<string>;
  /**
   * On one author's page the author is the page, and repeating their name on
   * every row is noise. In a reader's own feed the entries come from several
   * people at once and the name is the first thing they need.
   */
  showAuthor?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-sm text-ink-faint">{emptyText}</p>;
  }

  /*
   * Five entries, then a button. The entries are rendered HERE, on the
   * server, and only sliced client-side - so the collapse never becomes a
   * second code path around the lock masking above it.
   */
  return (
    <ShowMoreList className="border-t border-line" initial={5}>
      {entries.map((entry) =>
        entry.type === 'post' ? (
          <PostEntry
            key={`post-${entry.post.id}`}
            post={entry.post}
            showAuthor={showAuthor}
          />
        ) : (
          <BetEntry
            key={`bet-${entry.bet.id}`}
            bet={entry.bet}
            locked={lockedBetIds?.has(entry.bet.id) ?? false}
            showAuthor={showAuthor}
          />
        ),
      )}
    </ShowMoreList>
  );
}

function Timestamp({ at }: { at: Date }) {
  return (
    <time className="tabular text-xs text-ink-faint" dateTime={at.toISOString()}>
      {formatDateTimeKa(at)}
    </time>
  );
}

function Author({
  author,
}: {
  author: { displayName: string; slug: string; photoPath: string | null };
}) {
  return (
    <Link
      href={`/analysts/${author.slug}`}
      className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-accent"
    >
      <Avatar name={author.displayName} src={author.photoPath} size="sm" />
      {author.displayName}
    </Link>
  );
}

function PostEntry({
  post,
  showAuthor,
}: {
  post: Extract<FeedEntry, { type: 'post' }>['post'];
  showAuthor: boolean;
}) {
  return (
    <li className="border-b border-line py-5">
      {showAuthor ? <Author author={post.author} /> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rule-label">სტატუსი</span>
        <Timestamp at={post.createdAt} />
      </div>

      <p className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
        {post.bodyKa}
      </p>
    </li>
  );
}

function BetEntry({
  bet,
  locked,
  showAuthor,
}: {
  bet: Extract<FeedEntry, { type: 'bet' }>['bet'];
  locked: boolean;
  showAuthor: boolean;
}) {
  return (
    <li className="border-b border-line py-5">
      {showAuthor && bet.author ? <Author author={bet.author} /> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rule-label">ფსონი</span>
        {bet.publishedAt ? <Timestamp at={bet.publishedAt} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start gap-4">
        <Link href={`/free/${bet.id}`} className="shrink-0">
          {/* The sport tile for every row, locked or not: the bookmaker's
              screenshot is evidence for the administrator, not a thumbnail. */}
          <SportTile
            code={bet.sport.code}
            className="h-16 w-24 rounded"
            iconClassName="size-6"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/free/${bet.id}`}
              className="font-medium text-ink hover:text-accent"
            >
              {locked ? 'დახურული პროგნოზი' : bet.titleKa}
            </Link>
            <StatusBadge status={bet.status} />
          </div>

          <p className="mt-1 text-xs text-ink-muted">
            {bet.sport.nameKa}
            {' · კოეფ. '}
            <span className="tabular">{formatOdds(bet.oddsMilli)}</span>
            {bet.result ? (
              <>
                {' · '}
                <span
                  className={`tabular ${
                    bet.result.profitUnitsCenti < 0 ? 'text-loss' : 'text-win'
                  }`}
                >
                  {formatUnitsSigned(bet.result.profitUnitsCenti)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </li>
  );
}
