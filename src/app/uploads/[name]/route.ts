import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/authorization';
import { isTicketLocked } from '@/lib/auth/entitlements';
import { activePlanGrants } from '@/lib/queries/tickets';
import { readStoredScreenshot } from '@/lib/uploads';
import { imageAccess, type ImageAccess } from '@/lib/uploads-access';

/**
 * Serves stored images.
 *
 * Images live in the database rather than on disk, so nothing is reachable by
 * static path and this handler is the only way to read one. That means the
 * content type is always the one recorded at upload, never one inferred from
 * a filename.
 *
 * Access follows the ticket the image belongs to (see lib/uploads-access): a
 * paid ticket's slip opens only for whoever may open the ticket, and a result
 * photo only for the administrator and the author. What is open to everyone
 * is cached hard; what is open to one viewer is never cached, so a shared
 * cache cannot hand one buyer's ticket to the next visitor.
 */
export const dynamic = 'force-dynamic';

const NOT_FOUND = () => new Response('Not found', { status: 404 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const image = await readStoredScreenshot(name);
  if (!image) return NOT_FOUND();

  const access = await accessFor(`/uploads/${name}`);
  // 404, not 403: a refusal would confirm the file exists.
  if (access === 'denied') return NOT_FOUND();

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'content-type': image.mimeType,
      // Filenames are random and content never changes under one, so a public
      // image can be cached hard. A private one must not be cached at all.
      'cache-control':
        access === 'public'
          ? 'public, max-age=31536000, immutable'
          : 'private, no-store, max-age=0',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function accessFor(path: string): Promise<ImageAccess> {
  const [slipTickets, resultTickets] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        OR: [{ screenshotPath: path }, { extraScreenshotPaths: { has: path } }],
      },
      select: { id: true, visibility: true, authorId: true, status: true },
    }),
    prisma.prediction.findMany({
      where: { resultScreenshotPath: path },
      select: { authorId: true, postedById: true },
    }),
  ]);

  const openToEveryone = slipTickets.map(
    (ticket) => !isTicketLocked(ticket, null, []),
  );

  // Open to a stranger and claimed by nothing private: no viewer to look up.
  const firstPass = imageAccess({
    slips: openToEveryone.map((open) => ({
      lockedForViewer: !open,
      lockedForEveryone: !open,
    })),
    results: resultTickets.map(() => ({ visibleToViewer: false })),
  });
  if (firstPass === 'public') return 'public';

  const actor = await getCurrentUser();
  if (!actor) return 'denied';

  const premiumIds = slipTickets
    .filter((ticket) => ticket.visibility === 'PREMIUM')
    .map((ticket) => ticket.id);
  const [grants, purchases] = await Promise.all([
    activePlanGrants(actor.userId),
    premiumIds.length
      ? prisma.predictionPurchase.findMany({
          where: {
            userId: actor.userId,
            predictionId: { in: premiumIds },
            revokedAt: null,
          },
          select: { predictionId: true },
        })
      : Promise.resolve([]),
  ]);
  const bought = new Set(purchases.map((row) => row.predictionId));
  const viewer = { role: actor.role, analystProfileId: actor.analystProfileId };

  return imageAccess({
    slips: slipTickets.map((ticket, index) => ({
      lockedForViewer: isTicketLocked(ticket, viewer, grants, bought.has(ticket.id)),
      lockedForEveryone: !openToEveryone[index],
    })),
    results: resultTickets.map((ticket) => ({
      visibleToViewer:
        actor.role === 'ADMIN' ||
        actor.userId === ticket.postedById ||
        (ticket.authorId !== null && actor.analystProfileId === ticket.authorId),
    })),
  });
}
