'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { storeScreenshot } from '@/lib/uploads';
import { freeTicketSchema } from '@/lib/validation/schemas';

/**
 * Community free tickets.
 *
 * Any signed-in user may post one. Three rules keep that from polluting the
 * thing the product actually sells:
 *
 *   1. `authorId` stays null, so the ticket belongs to no analyst's record and
 *      is excluded from every accuracy and ROI figure.
 *   2. Visibility is forced PUBLIC here rather than read from the form. A
 *      community post is a free ticket by definition; letting the form choose
 *      would let anyone publish behind someone else's paywall.
 *   3. When an ANALYST posts here, it is still a community ticket. Their own
 *      record is built on /analyst, deliberately, so the two cannot be mixed
 *      up by accident.
 */
export async function postFreeTicketAction(
  _previous: ActionResult<{ ticketId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const actor = await requireUser();

    const limit = rateLimiter.check(
      `free:${actor.userId}`,
      RATE_LIMITS.postBet,
    );
    if (!limit.allowed) {
      return fail(
        ERROR_CODES.RATE_LIMITED,
        'ძალიან ბევრი მცდელობა. სცადეთ ცოტა ხანში.',
      );
    }

    const slip = formData.get('screenshot');
    if (!(slip instanceof File) || slip.size === 0) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ატვირთეთ სკრინშოტი.', {
        screenshot: ['ატვირთეთ სკრინშოტი.'],
      });
    }

    const stored = await storeScreenshot(slip);

    const parsed = freeTicketSchema.safeParse({
      sportId: formData.get('sportId'),
      screenshotPath: stored.urlPath,
      titleKa: formData.get('titleKa'),
      descriptionKa: formData.get('descriptionKa') || undefined,
      odds: formData.get('odds'),
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const sport = await prisma.sport.findUnique({
      where: { id: parsed.data.sportId },
      select: { id: true, isActive: true },
    });
    if (!sport || !sport.isActive) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'აირჩიეთ სპორტი.');
    }

    const ticket = await prisma.prediction.create({
      data: {
        authorId: null,
        postedById: actor.userId,
        sportId: sport.id,
        screenshotPath: parsed.data.screenshotPath,
        titleKa: parsed.data.titleKa,
        descriptionKa: parsed.data.descriptionKa ?? null,
        // oddsSchema already returns milli: 1.85 arrives here as 1850.
        oddsMilli: parsed.data.odds,
        stakeUnitsCenti: 100,
        visibility: 'PUBLIC',
        publishedAt: new Date(),
      },
    });

    await writeAuditLog({
      action: AUDIT_ACTIONS.PREDICTION_PUBLISHED,
      entityType: 'Prediction',
      entityId: ticket.id,
      summary: `უფასო ბილეთი: ${parsed.data.titleKa}`,
      actorId: actor.userId,
      actorRole: actor.role,
    });

    revalidatePath('/free');
    return ok({ ticketId: ticket.id });
  } catch (error) {
    return toActionFailure(error);
  }
}
