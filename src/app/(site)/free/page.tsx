import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import {
  listFreeTickets,
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
import { FreeTicketForm } from './upload-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'უფასო ბილეთები',
  description:
    'უფასო ბილეთები ანალიტიკოსებისა და მომხმარებლებისგან, ავტორის ღია ჩანაწერით.',
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
 * The free feed, in the same table as /paid so the two read as one product.
 * The differences are inherent, not layout: no price column (nothing is for
 * sale here) and an upload box (community tickets are allowed).
 *
 * Signed-out visitors see the same table the paid page shows them: every row
 * with its odds, author and first-leg time, and the pick itself locked while
 * the bet is open. The gate is on the pick, not the page - what a free
 * ticket costs is an account, and a locked row is better advertising for one
 * than a wall.
 */
export default async function FreeTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = ticketFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : { page: 1, sort: 'soon' as const };

  const actor = await getCurrentUser();
  const viewer = actor
    ? { role: actor.role, analystProfileId: actor.analystProfileId }
    : null;

  const [{ items, total, page, pageCount }, sports] = await Promise.all([
    listFreeTickets(filter),
    listSports(),
  ]);

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
    return suffix ? `/free?${suffix}` : '/free';
  };

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          უფასო ბილეთები
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          ატვირთვა შეუძლია ყველა დარეგისტრირებულ მომხმარებელს. ავტორის
          სვეტში ჩანს ვისი ბილეთია და როგორი ჩანაწერი უდგას უკან.
        </p>
      </header>

      {/* --------------------------------------------------------------- */}
      {/* Upload for members; the way in for everyone else                  */}
      {/* --------------------------------------------------------------- */}
      {actor ? (
        <details className="mb-6 rounded-card border border-line bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-ink marker:content-none sm:px-5">
            <span className="text-accent">+</span> ბილეთის ატვირთვა
          </summary>
          <div className="border-t border-line p-4 sm:p-5">
            <FreeTicketForm
              sports={sports.map((sport) => ({
                value: sport.id,
                label: sport.nameKa,
              }))}
            />
          </div>
        </details>
      ) : (
        <p className="mb-6 rounded-card border border-line bg-surface px-4 py-3.5 text-sm text-ink-muted sm:px-5">
          დახურული ბილეთები და ატვირთვა იხსნება შესვლის შემდეგ.{' '}
          <Link href="/login" className="text-accent underline">
            შესვლა
          </Link>{' '}
          ან{' '}
          <Link href="/register" className="text-accent underline">
            რეგისტრაცია
          </Link>
          , Telegram-ითაც შეგიძლიათ.
        </p>
      )}

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
            {total} ბილეთი
          </span>
        </span>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-8" aria-hidden="true" />}
          title="ბილეთი ჯერ არ არის"
          description="აირჩიეთ სხვა სპორტი ან ატვირთეთ პირველი."
        />
      ) : (
        <TicketList
          tickets={items}
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
                    // Free tickets never need a subscription, so no grants.
                    [],
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
