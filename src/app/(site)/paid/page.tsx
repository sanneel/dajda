import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import {
  activePlanGrants,
  listPaidTickets,
  listSports,
  type TicketSort,
} from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { TicketList } from '@/components/ticket-list';
import { SortSelect } from '@/components/sort-select';
import { EmptyState } from '@/components/ui/feedback';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ფასიანი პროგნოზები',
  description:
    'ანალიტიკოსების ფასიანი პროგნოზები: შეძენამდე ჩანს კოეფიციენტი, ფასი და პირველი პოზიციის დაწყების დრო, დახურვის შემდეგ კი სრული ჩანაწერი.',
};

/*
 * The hint under each option is the sort key in plain words. Both orderings
 * are defensible and neither is guessable from its name alone, so the menu
 * says which question it answers rather than making the reader try one.
 */
const SORTS: { value: TicketSort; label: string; hintKa: string }[] = [
  {
    value: 'soon',
    label: 'მალე იწყება',
    hintKa: 'პირველი პოზიციის დაწყების დროით',
  },
  {
    value: 'profit',
    label: 'პროფიტი',
    hintKa: 'ავტორის ჩანაწერის მოგებით',
  },
];

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
  const filter = parsed.success ? parsed.data : { page: 1, sort: 'soon' as const };

  const actor = await getCurrentUser();

  const [{ items, total, page, pageCount }, sports, grants] = await Promise.all([
    listPaidTickets(filter),
    listSports(),
    activePlanGrants(actor?.userId),
  ]);

  const viewer = actor
    ? { role: actor.role, analystProfileId: actor.analystProfileId }
    : null;

  const hrefFor = (overrides: {
    sport?: string | null;
    sort?: TicketSort;
    page?: number;
  }) => {
    const query = new URLSearchParams();
    const sport =
      overrides.sport === undefined ? filter.sport : overrides.sport;
    const sort = overrides.sort ?? filter.sort ?? 'soon';
    if (sport) query.set('sport', sport);
    if (sort !== 'soon') query.set('sort', sort);
    if ((overrides.page ?? 1) > 1) query.set('page', String(overrides.page));
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
          იხსნება ავტორის გამოწერით. შეძენამდე ჩანს კოეფიციენტი, ფასი და
          პირველი პოზიციის დაწყების დრო; დათვლის შემდეგ პროგნოზი საჯარო
          ჩანაწერის ნაწილი ხდება.
        </p>
      </header>

      {/* --------------------------------------------------------------- */}
      {/* One control bar: sport left, order and count right                */}
      {/* --------------------------------------------------------------- */}
      <nav
        className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3 text-sm"
        aria-label="ფილტრი და სორტირება"
      >
        <Link
          href={hrefFor({ sport: null })}
          className={
            filter.sport ? 'text-ink-muted hover:text-ink' : 'text-accent'
          }
        >
          ყველა
        </Link>
        {sports.map((sport) => (
          <Link
            key={sport.code}
            href={hrefFor({ sport: sport.code })}
            className={
              filter.sport === sport.code
                ? 'text-accent'
                : 'text-ink-muted hover:text-ink'
            }
          >
            {sport.nameKa}
          </Link>
        ))}

        <span className="ml-auto flex items-center gap-x-4">
          <SortSelect
            value={filter.sort ?? 'soon'}
            options={SORTS.map((sort) => ({
              ...sort,
              href: hrefFor({ sort: sort.value }),
            }))}
          />
          <span className="tabular text-xs text-ink-faint">
            {total} პროგნოზი
          </span>
        </span>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-8" aria-hidden="true" />}
          title="პროგნოზი ჯერ არ არის"
          description="აირჩიეთ სხვა სპორტი ან შეამოწმეთ მოგვიანებით."
        />
      ) : (
        <TicketList
          tickets={items}
          showPrice
          profileTab="paid"
          lockedIds={
            new Set(
              items
                .filter((ticket) =>
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
              href={hrefFor({ page: page - 1 })}
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
              href={hrefFor({ page: page + 1 })}
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
