import type { Metadata } from 'next';
import { Ticket } from 'lucide-react';
import {
  activePlanGrants,
  listPaidTickets,
  listSports,
  purchasedTicketIds,
} from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { TicketList } from '@/components/ticket-list';
import { SortTicks } from '@/components/sort-ticks';
import { AddTicketButton } from '@/components/add-ticket-button';
import { hasSubscriptionForSale } from '@/lib/predictions/subscription-gate';
import { EmptyState } from '@/components/ui/feedback';
import { Pager } from '@/components/ui/pager';
import { ResponsibleUseNotice } from '@/components/responsible-use';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ფასიანი პროგნოზები',
  description:
    'ანალიტიკოსების ფასიანი პროგნოზები: შეძენამდე ჩანს კოეფიციენტი, ფასი და პირველი პოზიციის დაწყების დრო, დახურვის შემდეგ კი სრული ჩანაწერი.',
};

/**
 * The paid feed: every singly sold (PREMIUM) bet, in the same table the free
 * feed uses; a subscription ticket is not sold one by one, so it is not here,
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

  const [
    { items, total, page, pageCount },
    grants,
    purchased,
    sports,
    canPostSubscription,
  ] = await Promise.all([
    listPaidTickets(filter),
    activePlanGrants(actor?.userId),
    purchasedTicketIds(actor?.userId),
    // Only an analyst is offered the post form, so only they need the list.
    actor?.analystProfileId
      ? listSports()
      : Promise.resolve([] as { id: string; nameKa: string }[]),
    // The post form offers subscription tickets only once there is a
    // subscription to post them into.
    actor?.analystProfileId
      ? hasSubscriptionForSale(actor.analystProfileId)
      : false,
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
          გამოწერაში არ შედის: თითოეული ბილეთი ცალკე იყიდება.
        </p>
      </header>

      {/* Posting belongs on the feed being posted to: an analyst reading the
          paid feed should not have to navigate away to add to it. */}
      {actor?.analystProfileId ? (
        <div className="mb-6">
          <AddTicketButton
            canPostSubscription={canPostSubscription}
            sports={sports.map((sport) => ({
              value: sport.id,
              label: sport.nameKa,
            }))}
          />
        </div>
      ) : null}

      {/* --------------------------------------------------------------- */}
      {/* One control bar: caption and count, then the chips               */}
      {/* --------------------------------------------------------------- */}
      <div className="mb-5">
        <SortTicks
          basePath="/paid"
          showPrice
          total={total}
          state={{
            odds: filter.odds,
            acc: filter.acc === '1',
            price: filter.price,
            soon: filter.soon === '1',
          }}
        />
      </div>

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
                .filter((ticket) =>
                  isTicketLocked(
                    {
                      visibility: ticket.visibility,
                      authorId: ticket.author?.id ?? null,
                      status: ticket.status,
                    },
                    viewer,
                    grants,
                    purchased.has(ticket.id),
                  ),
                )
                .map((ticket) => ticket.id),
            )
          }
        />
      )}

      <Pager page={page} pageCount={pageCount} hrefFor={hrefFor} />

      <div className="mt-12">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
