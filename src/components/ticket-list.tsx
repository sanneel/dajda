import Link from 'next/link';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import type { FeedTicket } from '@/lib/queries/tickets';
import {
  BILLING_PERIOD_KA,
  PREDICTION_VISIBILITY_KA,
} from '@/lib/labels';
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
    <div className="overflow-x-auto rounded-md border border-line">
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
                    {ticket.priceMinor !== null ? (
                      <>
                        <span className="tabular font-medium text-ink">
                          {formatMoney(
                            ticket.priceMinor,
                            ticket.priceCurrency ?? 'GEL',
                          )}
                        </span>
                        <div className="text-xs text-ink-faint">
                          {ticket.priceBillingPeriod
                            ? BILLING_PERIOD_KA[ticket.priceBillingPeriod]
                            : ''}
                        </div>
                        {locked && ticket.author ? (
                          <Link
                            href={`/analysts/${ticket.author.slug}?tab=plans#plans-heading`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            შეძენა გამოწერით
                          </Link>
                        ) : null}
                      </>
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
  );
}
