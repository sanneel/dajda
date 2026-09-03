import { listFreeTickets } from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { errorResponse, jsonResponse } from '@/lib/errors';
import { formatOdds } from '@/lib/format';

/**
 * The free-ticket feed.
 *
 * Answers exactly as the /free page would answer the same caller: signed-out
 * requests get every row with its odds, author and first-leg time, but an
 * OPEN pick's title and legs come back null with `locked: true` - a free
 * ticket costs an account. The bookmaker's screenshot is never in the feed:
 * it is evidence for the administrator, not content. Settled rows are the public record and open to
 * everyone. The written description is never included: an analyst's paid
 * bets share this table, and a JSON feed must not become the unauthenticated
 * path to them.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = ticketFilterSchema.safeParse(
      Object.fromEntries(url.searchParams),
    );

    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'არასწორი ფილტრი.',
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 422 },
      );
    }

    const actor = await getCurrentUser();
    const viewer = actor
      ? { role: actor.role, analystProfileId: actor.analystProfileId }
      : null;

    const { items, total, page, pageCount } = await listFreeTickets(parsed.data);

    return jsonResponse({
      total,
      page,
      pageCount,
      items: items.map((ticket) => {
        const locked = isTicketLocked(
          {
            visibility: ticket.visibility,
            authorId: ticket.author?.id ?? null,
            status: ticket.status,
          },
          viewer,
          // Free tickets never need a subscription, so no grants.
          [],
        );

        return {
          id: ticket.id,
          title: locked ? null : ticket.titleKa,
          sport: ticket.sport.code,
          selections: locked
            ? null
            : ticket.selections.map((leg) => ({
                event: leg.eventKa,
                pick: leg.pickKa,
                odds: formatOdds(leg.oddsMilli),
              })),
          locked,
          oddsAtPublication: formatOdds(ticket.oddsMilli),
          publishedAt: ticket.publishedAt,
          eventAt: ticket.eventAt,
          finishedAt: ticket.finishedAt,
          status: ticket.status,
          // Null for a community ticket: it belongs to nobody's record.
          analyst: ticket.author
            ? { slug: ticket.author.slug, displayName: ticket.author.displayName }
            : null,
          settledAt: ticket.result?.settledAt ?? null,
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
