import { listFreeTickets } from '@/lib/queries/tickets';
import { ticketFilterSchema } from '@/lib/validation/schemas';
import { errorResponse, jsonResponse } from '@/lib/errors';
import { formatOdds } from '@/lib/format';

/**
 * Public free-ticket feed.
 *
 * Returns only what is already free to read: the slip, the odds and the
 * outcome. The written description is deliberately NOT included, because an
 * analyst's paid bets share this table and a JSON feed must not become the
 * unauthenticated path to them.
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

    const { items, total, page, pageCount } = await listFreeTickets(parsed.data);

    return jsonResponse({
      total,
      page,
      pageCount,
      items: items.map((ticket) => ({
        id: ticket.id,
        title: ticket.titleKa,
        sport: ticket.sport.code,
        screenshot: ticket.screenshotPath,
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
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
