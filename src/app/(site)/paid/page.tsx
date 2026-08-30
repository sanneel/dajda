import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import {
  activePlanGrants,
  listPaidTickets,
  purchasedTicketIds,
} from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { TicketList } from '@/components/ticket-list';
import { SortTicks } from '@/components/sort-ticks';
import { EmptyState } from '@/components/ui/feedback';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ფასიანი პროგნოზები',
  description:
    'ანალიტიკოსების ფასიანი პროგნოზები: შეძენამდე ჩანს კოეფიციენტი, ფასი და პირველი პოზიციის დაწყების დრო, დახურვის შემდეგ კი სრული ჩანაწერი.',
};

/**
 * The paid feed: every PREMIUM/VIP bet in the same table the free feed uses,
 * plus one column - what unlocking it costs. No aggregate band on top: the
 * judgement figures live per row (the author's win rate) and in full on the
 * author's profile, so a headline number here would just say "average of
 * things you should be reading one by one".
 */
export default async function PaidTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = ticketFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : { page: 1 };

  const actor = await getCurrentUser();

  const [{ items, total, page, pageCount }, grants, purchased] =
    await Promise.all([
      listPaidTickets(filter),
      activePlanGrants(actor?.userId),
      purchasedTicketIds(actor?.userId),
    ]);

  const viewer = actor
    ? { role: actor.role, analystProfileId: actor.analystProfileId }
    : null;

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filter.odds) query.set('odds', filter.odds);
    if (filter.acc) query.set('acc', filter.acc);
    if (filter.price) query.set('price', filter.price);
    if (filter.soon) query.set('soon', '1');
    if (page > 1) query.set('page', String(page));
    const suffix = query.toString();
    return suffix ? `/paid?${suffix}` : '/paid';
  };

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          ფასიანი პროგნოზები
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          თითო ბილეთი ცალკე იყიდება ავტორის დადებული ფასით - გამოწერის
          გარეშეც. შეძენამდე ჩანს კოეფიციენტი, ფასი და პირველი პოზიციის
          დრო; დათვლის შემდეგ პროგნოზი საჯარო ჩანაწერის ნაწილი ხდება.
        </p>
      </header>

      {/* --------------------------------------------------------------- */}
      {/* One control bar: sort ticks left, count right                     */}
      {/* --------------------------------------------------------------- */}
      <nav
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
        aria-label="დალაგება"
      >
        <SortTicks
          basePath="/paid"
          showPrice
          state={{
            odds: filter.odds === '1',
            acc: filter.acc === '1',
            price: filter.price === '1',
            soon: filter.soon === '1',
          }}
        />
        <span className="ml-auto tabular text-xs text-ink-faint">
          {total} პროგნოზი
        </span>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-8" aria-hidden="true" />}
          title="პროგნოზი ჯერ არ არის"
          description="შეამოწმეთ მოგვიანებით."
        />
      ) : (
        <TicketList
          tickets={items}
          showPrice
          profileTab="paid"
          lockedIds={
            new Set(
              items
                .filter(
                  (ticket) =>
                    // A single purchase opens exactly that row.
                    !purchased.has(ticket.id) &&
                    isTicketLocked(
                      {
                        visibility: ticket.visibility,
                        authorId: ticket.author?.id ?? null,
                        status: ticket.status,
                      },
                      viewer,
                      grants,
                    ),
                )
                .map((ticket) => ticket.id),
            )
          }
        />
      )}

      {pageCount > 1 ? (
        <nav
          className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-5 text-sm"
          aria-label="გვერდები"
        >
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              className="text-ink hover:text-accent"
            >
              წინა
            </Link>
          ) : (
            <span className="text-ink-faint">წინა</span>
          )}
          <span className="tabular text-ink-muted">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={hrefFor(page + 1)}
              className="text-ink hover:text-accent"
            >
              შემდეგი
            </Link>
          ) : (
            <span className="text-ink-faint">შემდეგი</span>
          )}
        </nav>
      ) : null}

      <div className="mt-12">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
