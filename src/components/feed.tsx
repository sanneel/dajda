import Link from 'next/link';
import Image from 'next/image';
import { Radio } from 'lucide-react';
import type { FeedEntry } from '@/lib/queries/feed';
import { formatDateTimeKa, formatOdds, formatUnitsSigned } from '@/lib/format';
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
 *
 * A running live session is the only thing that gets a coloured marker, and it
 * is a dot and a word rather than an animated pill: the point is to say "this
 * is happening now", not to make the page feel busy.
 */
export function Feed({
  entries,
  emptyText = 'ჯერ არაფერია.',
  lockedBetIds,
}: {
  entries: FeedEntry[];
  emptyText?: string;
  /**
   * Bets whose pick this viewer has not paid for. The entry stays in the
   * timeline (odds, status, date), but the title and the slip are withheld.
   * Decided by the caller, because only the page knows who is looking.
   */
  lockedBetIds?: ReadonlySet<string>;
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
          <PostEntry key={`post-${entry.post.id}`} post={entry.post} />
        ) : (
          <BetEntry
            key={`bet-${entry.bet.id}`}
            bet={entry.bet}
            locked={lockedBetIds?.has(entry.bet.id) ?? false}
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

function PostEntry({ post }: { post: Extract<FeedEntry, { type: 'post' }>['post'] }) {
  const isLive = post.kind === 'LIVE_NOTICE';
  const running = isLive && post.endedAt === null;

  return (
    <li className="border-b border-line py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {isLive ? (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              running ? 'text-signal' : 'text-ink-faint'
            }`}
          >
            <Radio className="size-3.5" aria-hidden="true" />
            {running ? 'ლაივი მიმდინარეობს' : 'ლაივი დასრულდა'}
          </span>
        ) : (
          <span className="rule-label">სტატუსი</span>
        )}
        <Timestamp at={post.createdAt} />
      </div>

      {isLive && post.liveLabelKa ? (
        <p className="mt-2 font-semibold text-ink">
          {post.liveLabelKa}
          {post.liveAt ? (
            <span className="tabular ml-2 font-normal text-ink-muted">
              {formatDateTimeKa(post.liveAt)}
            </span>
          ) : null}
        </p>
      ) : null}

      <p className="mt-1.5 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
        {post.bodyKa}
      </p>

      {/* Updates hang under the notice that opened the session, oldest first,
          so the session reads as a transcript rather than a reversed stack. */}
      {post.updates.length > 0 ? (
        <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
          {post.updates.map((update) => (
            <li key={update.id}>
              <Timestamp at={update.createdAt} />
              <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {update.bodyKa}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function BetEntry({
  bet,
  locked,
}: {
  bet: Extract<FeedEntry, { type: 'bet' }>['bet'];
  locked: boolean;
}) {
  return (
    <li className="border-b border-line py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rule-label">ფსონი</span>
        {bet.publishedAt ? <Timestamp at={bet.publishedAt} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-start gap-4">
        <Link href={`/free/${bet.id}`} className="shrink-0">
          {locked ? (
            <SportTile
              code={bet.sport.code}
              className="h-16 w-24 rounded"
              iconClassName="size-6"
            />
          ) : (
            <span className="relative block h-16 w-24 overflow-hidden rounded border border-line bg-canvas">
              <Image
                src={bet.screenshotPath}
                alt=""
                fill
                sizes="6rem"
                className="object-cover"
              />
            </span>
          )}
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
                  {formatUnitsSigned(bet.result.profitUnitsCenti)} ერთ.
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </li>
  );
}
