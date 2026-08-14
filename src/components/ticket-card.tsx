import Link from 'next/link';
import Image from 'next/image';
import type { PublicTicket } from '@/lib/queries/tickets';
import { formatDateTimeKa, formatOdds } from '@/lib/format';
import { StatusBadge } from './ui/badge';

/**
 * A free ticket, as it appears in the feed.
 *
 * The slip is the card. Everything else is one line of context: who posted it,
 * what sport, what odds, how it resolved. There is no metric grid and no
 * confidence read-out, because a free ticket carries no record and dressing it
 * up with statistics would imply one.
 *
 * An analyst's name links to their profile; a community poster's does not. The
 * difference is the whole point of the distinction, so it has to be visible
 * without reading the small print.
 */
export function TicketCard({ ticket }: { ticket: PublicTicket }) {
  const { author, postedBy, sport, status } = ticket;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-strong focus-within:border-line-strong">
      {/* Fixed aspect so a feed stays on a grid whatever people screenshot. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-canvas">
        <Image
          src={ticket.screenshotPath}
          alt={`ბილეთის სკრინშოტი: ${ticket.titleKa}`}
          fill
          sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
          className="object-contain"
        />
        <div className="absolute right-2 top-2">
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-ink-faint">{sport.nameKa}</p>

        <h3 className="mt-1 text-base font-semibold leading-snug text-ink">
          {/* Stretched link: the whole card is clickable, one tab stop. */}
          <Link
            href={`/free/${ticket.id}`}
            className="after:absolute after:inset-0"
          >
            {ticket.titleKa}
          </Link>
        </h3>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3.5">
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">ავტორი</p>
            {author ? (
              <Link
                href={`/analysts/${author.slug}`}
                className="relative z-10 block truncate text-sm text-ink hover:text-accent"
              >
                {author.displayName}
              </Link>
            ) : (
              <p className="truncate text-sm text-ink-muted">{postedBy.name}</p>
            )}
          </div>

          <p className="tabular shrink-0 text-right text-lg font-bold text-ink">
            {formatOdds(ticket.oddsMilli)}
          </p>
        </div>

        <p className="tabular mt-2 border-t border-line pt-2 text-xs text-ink-faint">
          {ticket.publishedAt ? formatDateTimeKa(ticket.publishedAt) : '·'}
        </p>
      </div>
    </article>
  );
}
