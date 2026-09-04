'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireApprovedAnalyst } from '@/lib/auth/authorization';
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
import {
  brandingRefusalMessage,
  screenSlipForBookmakerBranding,
} from '@/lib/slip-screening';
import { freeTicketSchema } from '@/lib/validation/schemas';

/**
 * Free-feed tickets, posted from /free.
 *
 * Only an approved analyst may post one - the free feed carries the same
 * signature as everything else on the product: a verifiable author. Two
 * rules still apply:
 *
 *   1. `authorId` stays null, so a ticket posted HERE belongs to no analyst's
 *      record and is excluded from every accuracy and units figure. An
 *      analyst's own record is built on /analyst, deliberately, so the two
 *      cannot be mixed up by accident.
 *   2. Visibility is forced PUBLIC here rather than read from the form -
 *      letting the form choose would let a post slip behind a paywall.
 */
export async function postFreeTicketAction(
  _previous: ActionResult<{ ticketId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const actor = await requireApprovedAnalyst();

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

    // Same rule as a paid slip: no bookmaker logo or name on the screenshot
    // (author agreement, clause 3.6).
    const screening = await screenSlipForBookmakerBranding(slip);
    if (screening.checked && screening.flagged) {
      const message = brandingRefusalMessage(screening.brands);
      return fail(ERROR_CODES.VALIDATION_ERROR, message, {
        screenshot: [message],
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
