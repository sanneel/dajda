import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import {
  listFreeTickets,
  listSports,
} from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { TicketList } from '@/components/ticket-list';
import { SortTicks } from '@/components/sort-ticks';
import { EmptyState } from '@/components/ui/feedback';
import { Pager } from '@/components/ui/pager';
import { ResponsibleUseNotice } from '@/components/responsible-use';
import { AddTicketButton } from '@/components/add-ticket-button';
import { hasSubscriptionForSale } from '@/lib/predictions/subscription-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'უფასო პროგნოზები',
  description:
    'უფასო პროგნოზები ანალიტიკოსებისა და მომხმარებლებისგან, ავტორის ღია ჩანაწერით.',
};

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
  const filter = parsed.success ? parsed.data : { page: 1 };

  const actor = await getCurrentUser();
  const viewer = actor
    ? { role: actor.role, analystProfileId: actor.analystProfileId }
    : null;

  const [{ items, total, page, pageCount }, sports, canPostSubscription] =
    await Promise.all([
      listFreeTickets(filter),
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

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filter.odds) query.set('odds', filter.odds);
    if (filter.acc) query.set('acc', filter.acc);
    if (filter.soon) query.set('soon', '1');
    if (page > 1) query.set('page', String(page));
    const suffix = query.toString();
    return suffix ? `/free?${suffix}` : '/free';
  };

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          უფასო პროგნოზები
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          ანალიტიკოსების უფასო პროგნოზები მომავალ მატჩებზე. სრული პროგნოზი
          იხსნება შესვლის შემდეგ, გადახდის გარეშე.
        </p>
      </header>

      {/* --------------------------------------------------------------- */}
      {/* Posting, for analysts; the way in for everyone else               */}
      {/* --------------------------------------------------------------- */}
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
      ) : actor ? (
        <p className="mb-6 rounded-card border border-line bg-surface px-4 py-3.5 text-sm text-ink-muted sm:px-5">
          პროგნოზის ატვირთვა ანალიტიკოსებს შეუძლიათ.{' '}
          <Link href="/apply" className="text-accent underline">
            ანალიტიკოსად რეგისტრაცია
          </Link>
        </p>
      ) : (
        <p className="mb-6 rounded-card border border-line bg-surface px-4 py-3.5 text-sm text-ink-muted sm:px-5">
          უფასო პროგნოზები იხსნება შესვლის შემდეგ, გადახდის გარეშე.{' '}
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
      {/* One control bar: caption and count, then the chips               */}
      {/* --------------------------------------------------------------- */}
      <div className="mb-5">
        <SortTicks
          basePath="/free"
          total={total}
          state={{
            odds: filter.odds,
            acc: filter.acc === '1',
            soon: filter.soon === '1',
          }}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-8" aria-hidden="true" />}
          title="პროგნოზი ჯერ არ არის"
          description="სცადეთ სხვა დალაგება ან ატვირთეთ პირველი."
        />
      ) : (
        <TicketList
          tickets={items}
          maskPicks
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

      <Pager page={page} pageCount={pageCount} hrefFor={hrefFor} />

      <div className="mt-12">
        <ResponsibleUseNotice />
      </div>
    </div>
  );
}
