import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { listFreeTickets, listSports } from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { TicketCard } from '@/components/ticket-card';
import { EmptyState } from '@/components/ui/feedback';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { FreeTicketForm } from './upload-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'უფასო ბილეთები',
  description: '[უფასო ბილეთების გვერდის აღწერა საძიებოსთვის]',
};

/**
 * The free feed: every public ticket, whoever posted it.
 *
 * Analysts and ordinary users share one list on purpose. What separates them
 * is not where their ticket appears but whether it counts: an analyst's name
 * links to a record you can check, a community poster's does not.
 *
 * Uploading is a disclosure rather than a separate page, so posting a ticket
 * never takes you away from the tickets.
 */
export default async function FreeTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = ticketFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : { page: 1 };

  const [{ items, total, page, pageCount }, sports, actor] = await Promise.all([
    listFreeTickets(filter),
    listSports(),
    getCurrentUser(),
  ]);

  const hrefForPage = (target: number) => {
    const query = new URLSearchParams();
    if (filter.sport) query.set('sport', filter.sport);
    if (target > 1) query.set('page', String(target));
    const suffix = query.toString();
    return suffix ? `/free?${suffix}` : '/free';
  };

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          უფასო ბილეთები
        </h1>
        <p className="ph mt-2 max-w-2xl">
          [ერთი წინადადება: ვის შეუძლია ატვირთვა და რატომ არ ითვლება ეს
          სტატისტიკაში]
        </p>
      </header>

      {/* --------------------------------------------------------------- */}
      {/* Upload                                                            */}
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
          ბილეთის ასატვირთად{' '}
          <Link href="/login" className="text-accent underline">
            შედით
          </Link>{' '}
          ან{' '}
          <Link href="/register" className="text-accent underline">
            დარეგისტრირდით
          </Link>
          .
        </p>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Sport filter: one control, no date pickers, no status tabs       */}
      {/* --------------------------------------------------------------- */}
      <nav
        className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3 text-sm"
        aria-label="სპორტის ფილტრი"
      >
        <Link
          href="/free"
          className={
            filter.sport ? 'text-ink-muted hover:text-ink' : 'text-accent'
          }
        >
          ყველა
        </Link>
        {sports.map((sport) => (
          <Link
            key={sport.code}
            href={`/free?sport=${sport.code}`}
            className={
              filter.sport === sport.code
                ? 'text-accent'
                : 'text-ink-muted hover:text-ink'
            }
          >
            {sport.nameKa}
          </Link>
        ))}
        <span className="tabular ml-auto text-xs text-ink-faint">
          {total} ბილეთი
        </span>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-8" aria-hidden="true" />}
          title="ბილეთი ჯერ არ არის"
          description="აირჩიეთ სხვა სპორტი ან ატვირთეთ პირველი."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav
          className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-5 text-sm"
          aria-label="გვერდები"
        >
          {page > 1 ? (
            <Link href={hrefForPage(page - 1)} className="text-ink hover:text-accent">
              წინა
            </Link>
          ) : (
            <span className="text-ink-faint">წინა</span>
          )}
          <span className="tabular text-ink-muted">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={hrefForPage(page + 1)} className="text-ink hover:text-accent">
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
