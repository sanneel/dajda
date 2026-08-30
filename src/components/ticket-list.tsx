import Link from 'next/link';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import type { FeedTicket } from '@/lib/queries/tickets';
import { PREDICTION_VISIBILITY_KA } from '@/lib/labels';
import {
  formatDateTimeKa,
  formatMoney,
  formatOdds,
  formatPercentBps,
} from '@/lib/format';
import { Badge, StatusBadge } from './ui/badge';

/**
 * The ticket feed as a ruled table, one bet per row. The free and the paid
 * page share this one component, so the two can never drift apart; the paid
 * feed only ADDS the price column.
 *
 * The last column is the AUTHOR's all-time win rate, not the ticket's own
 * outcome: a feed of mostly-open bets has no outcomes yet, and "who is this
 * author" is the question a buyer actually weighs. Their name links to the
 * profile where that number can be checked in full.
 *
 * A locked row keeps the pre-purchase facts - odds, first-leg time, status,
 * author, price - and withholds the pick: no title, no slip. Must stay a
 * server component, so the withheld fields never reach the browser at all.
 */
/**
 * იაფი/ძვირი relative to the very list the reader is looking at: the median
 * of the one-off prices on this page. A tag against an invisible benchmark
 * would be an assertion; against the visible list it is a summary.
 */
function priceTag(
  tickets: FeedTicket[],
  ticket: FeedTicket,
): 'cheap' | 'expensive' | null {
  if (ticket.feedPriceMinor === null) return null;
  const prices = tickets
    .filter((row) => row.feedPriceMinor !== null)
    .map((row) => row.feedPriceMinor as number)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;

  const median =
    prices.length % 2 === 1
      ? (prices[(prices.length - 1) / 2] as number)
      : ((prices[prices.length / 2 - 1] as number) +
          (prices[prices.length / 2] as number)) /
        2;

  if (ticket.feedPriceMinor < median) return 'cheap';
  if (ticket.feedPriceMinor > median) return 'expensive';
  return null;
}

export function TicketList({
  tickets,
  lockedIds,
  showPrice = false,
  profileTab = 'free',
}: {
  tickets: FeedTicket[];
  /** Rows whose pick this viewer has not paid for. Decided by the page. */
  lockedIds?: ReadonlySet<string>;
  /** Paid feed only: the unlock price per row. */
  showPrice?: boolean;
  /**
   * Which panel an author link opens on their profile. A reader comparing
   * free tickets wants the free record; one browsing paid tickets wants the
   * paid one. Passed rather than derived from `showPrice` so the two stay
   * separate questions.
   */
  profileTab?: 'free' | 'paid';
}) {
  return (
    <>
    {/* Phones and tablets: one card per bet, per the mobile reference -
        a sideways-scrolling table is not a feed you can read with a thumb. */}
    <ul className="space-y-3 lg:hidden">
      {tickets.map((ticket) => {
        const locked = lockedIds?.has(ticket.id) ?? false;
        const tag = showPrice ? priceTag(tickets, ticket) : null;

        return (
          <li
            key={ticket.id}
            className="rounded-card border border-line bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              {locked ? (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-line bg-elevated">
                  <Lock className="size-5 text-ink-faint" aria-hidden="true" />
                </span>
              ) : (
                <span className="relative block size-14 shrink-0 overflow-hidden rounded-md border border-line bg-canvas">
                  <Image
                    src={ticket.screenshotPath}
                    alt=""
                    fill
                    sizes="3.5rem"
                    className="object-cover"
                  />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-ink">
                  {locked ? 'დახურული პროგნოზი' : ticket.titleKa}
                </p>
                <p className="mt-0.5 text-sm text-accent">
                  {ticket.sport.nameKa}
                </p>
              </div>

              <StatusBadge status={ticket.status} />
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-ink-faint">ავტორი</dt>
                <dd className="truncate text-ink">
                  {ticket.author ? (
                    <Link
                      href={`/analysts/${ticket.author.slug}?tab=${profileTab}`}
                      className="hover:text-accent"
                    >
                      {ticket.author.displayName}
                    </Link>
                  ) : (
                    ticket.postedBy.name
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">კოეფ.</dt>
                <dd className="tabular font-semibold text-ink">
                  {formatOdds(ticket.oddsMilli)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-ink-faint">მოგების %</dt>
                <dd className="tabular font-medium text-ink">
                  {ticket.authorHitRateBps !== null
                    ? formatPercentBps(ticket.authorHitRateBps)
                    : '–'}
                </dd>
              </div>
            </dl>

            {ticket.eventAt ? (
              <p className="tabular mt-2 text-xs text-ink-faint">
                იწყება: {formatDateTimeKa(ticket.eventAt)}
              </p>
            ) : null}

            {showPrice && ticket.feedPriceMinor !== null ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="tabular font-semibold text-ink">
                  {formatMoney(ticket.feedPriceMinor, ticket.priceCurrency ?? 'GEL')}
                </span>
                {tag === 'cheap' ? (
                  <Badge tone="accent">იაფი</Badge>
                ) : tag === 'expensive' ? (
                  <Badge tone="warn">ძვირი</Badge>
                ) : null}
                <span className="text-xs text-ink-faint">ერთჯერადი</span>
              </p>
            ) : null}

            <Link
              href={`/free/${ticket.id}`}
              className="mt-3 flex min-h-11 items-center justify-between rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
            >
              დეტალურად ნახვა
              <span aria-hidden="true" className="text-ink-faint">›</span>
            </Link>
          </li>
        );
      })}
    </ul>

    {/* Desktop: the ruled table, one bet per row. */}
    <div className="hidden overflow-x-auto rounded-md border border-line lg:block">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-elevated text-left">
            <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
              პროგნოზი
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
              ავტორი
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
              კოეფ.
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
              პირველი პოზიცია
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
              სტატუსი
            </th>
            {showPrice ? (
              <th scope="col" className="px-4 py-3 font-medium text-ink-muted">
                ფასი
              </th>
            ) : null}
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-ink-muted"
            >
              მოგებების %
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const locked = lockedIds?.has(ticket.id) ?? false;
            const isPaid = ticket.visibility !== 'PUBLIC';

            return (
              <tr
                key={ticket.id}
                className="border-b border-line last:border-0 hover:bg-elevated"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {locked ? (
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-line bg-elevated">
                        <Lock
                          className="size-4 text-ink-faint"
                          aria-hidden="true"
                        />
                      </span>
                    ) : (
                      <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded border border-line bg-canvas">
                        <Image
                          src={ticket.screenshotPath}
                          alt=""
                          fill
                          sizes="4rem"
                          className="object-cover"
                        />
                      </span>
                    )}

                    <div className="min-w-0">
                      <Link
                        href={`/free/${ticket.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {locked ? 'დახურული პროგნოზი' : ticket.titleKa}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
                        {ticket.sport.nameKa}
                        {isPaid ? (
                          <Badge tone="accent">
                            {PREDICTION_VISIBILITY_KA[ticket.visibility]}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  {ticket.author ? (
                    <>
                      <Link
                        href={`/analysts/${ticket.author.slug}?tab=${profileTab}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {ticket.author.displayName}
                      </Link>
                      <div className="text-xs text-ink-faint">
                        პროფილი და სტატისტიკა
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-ink-muted">
                        {ticket.postedBy.name}
                      </span>
                      <div className="text-xs text-ink-faint">მომხმარებელი</div>
                    </>
                  )}
                </td>

                <td className="tabular px-4 py-3 font-semibold text-ink">
                  {formatOdds(ticket.oddsMilli)}
                </td>

                <td className="tabular px-4 py-3 text-xs text-ink-muted">
                  {ticket.eventAt ? formatDateTimeKa(ticket.eventAt) : '·'}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>

                {showPrice ? (
                  <td className="px-4 py-3">
                    {ticket.feedPriceMinor !== null ? (
                      <>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="tabular font-medium text-ink">
                            {formatMoney(
                              ticket.feedPriceMinor,
                              ticket.priceCurrency ?? 'GEL',
                            )}
                          </span>
                          {priceTag(tickets, ticket) === 'cheap' ? (
                            <Badge tone="accent">იაფი</Badge>
                          ) : priceTag(tickets, ticket) === 'expensive' ? (
                            <Badge tone="warn">ძვირი</Badge>
                          ) : null}
                        </span>
                        <div className="text-xs text-ink-faint">
                          ერთჯერადი
                        </div>
                        {locked ? (
                          <Link
                            href={`/free/${ticket.id}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            შეძენა
                          </Link>
                        ) : null}
                      </>
                    ) : locked && ticket.author ? (
                      <Link
                        href={`/analysts/${ticket.author.slug}?tab=plans#plans-heading`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        შეძენა გამოწერით
                      </Link>
                    ) : (
                      <span className="text-ink-faint">·</span>
                    )}
                  </td>
                ) : null}

                <td className="tabular px-4 py-3 text-right">
                  {ticket.authorHitRateBps !== null ? (
                    <>
                      <span className="font-medium text-ink">
                        {formatPercentBps(ticket.authorHitRateBps)}
                      </span>
                      <div className="text-xs text-ink-faint">
                        {ticket.authorDecided} დათვლილი
                      </div>
                    </>
                  ) : (
                    <span className="text-ink-faint">·</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
