'use server';

import { revalidatePath } from 'next/cache';
import { requireApprovedAnalyst, requireUser } from '@/lib/auth/authorization';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { slugify } from '@/lib/slug';
import { randomBytes } from 'node:crypto';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import { storeIdentityDocument, storeScreenshot } from '@/lib/uploads';
import {
  analystApplicationSchema,
  createPredictionSchema,
  markFinishedSchema,
} from '@/lib/validation/schemas';
import {
  createPrediction,
  markPredictionFinished,
  publishPrediction,
} from '@/lib/predictions/service';

/**
 * Actions an analyst performs on their own bets.
 *
 * Every export begins with requireApprovedAnalyst(), which resolves the caller and
 * their analyst profile from the session cookie server-side. Ownership is
 * always taken from that profile, never from a form field, so posting as
 * somebody else is not expressible.
 */

function fieldErrorsFrom(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Post a bet.
 *
 * The screenshot arrives in the same submission as the rest of the form and is
 * stored first, because a bet row without its evidence is not worth writing.
 * If the upload is rejected, nothing is created.
 */
export async function postBetAction(
  _previous: ActionResult<{ predictionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ predictionId: string }>> {
  try {
    const analyst = await requireApprovedAnalyst();

    // Uploads are expensive and are the one endpoint worth flooding.
    const limit = rateLimiter.check(
      `bet:${analyst.userId}`,
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
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ატვირთეთ ფსონის სკრინშოტი.', {
        screenshot: ['ატვირთეთ ფსონის სკრინშოტი.'],
      });
    }

    const stored = await storeScreenshot(slip);

    const parsed = createPredictionSchema.safeParse({
      sportId: formData.get('sportId'),
      screenshotPath: stored.urlPath,
      titleKa: formData.get('titleKa'),
      descriptionKa: formData.get('descriptionKa') || undefined,
      odds: formData.get('odds'),
      stakeUnits: formData.get('stakeUnits') || 1,
      confidence: formData.get('confidence') || 'MEDIUM',
      visibility: formData.get('visibility') || 'PUBLIC',
      eventAt: formData.get('eventAt') || undefined,
      publishNow: formData.get('publishNow') !== 'off',
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    const prediction = await createPrediction(
      parsed.data,
      analyst.analystProfileId,
      { userId: analyst.userId, role: analyst.role },
    );

    revalidatePath('/analyst');
    revalidatePath('/free');
    revalidatePath('/analysts');

    return ok({ predictionId: prediction.id });
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Publish a draft the author saved earlier. */
export async function publishBetAction(
  _previous: ActionResult<{ published: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ published: true }>> {
  try {
    const analyst = await requireApprovedAnalyst();
    const predictionId = String(formData.get('predictionId') ?? '');
    if (!predictionId) return fail(ERROR_CODES.VALIDATION_ERROR);

    await publishPrediction(predictionId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidatePath('/analyst');
    revalidatePath('/free');
    return ok({ published: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Mark a bet finished and hand it to an admin.
 *
 * The result screenshot is optional. An admin can still settle without one,
 * so a missing image slows review down rather than blocking the author.
 */
export async function markBetFinishedAction(
  _previous: ActionResult<{ finished: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ finished: true }>> {
  try {
    const analyst = await requireApprovedAnalyst();

    const proof = formData.get('resultScreenshot');
    let resultScreenshotPath: string | undefined;

    if (proof instanceof File && proof.size > 0) {
      const stored = await storeScreenshot(proof);
      resultScreenshotPath = stored.urlPath;
    }

    const parsed = markFinishedSchema.safeParse({
      predictionId: formData.get('predictionId'),
      resultScreenshotPath,
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    await markPredictionFinished(parsed.data, analyst.analystProfileId, {
      userId: analyst.userId,
      role: analyst.role,
    });

    revalidatePath('/analyst');
    revalidatePath('/admin/predictions');
    return ok({ finished: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Becoming an analyst
// ---------------------------------------------------------------------------

/**
 * Apply to publish on the platform.
 *
 * Creates a PENDING profile and nothing else: no role is granted and nothing
 * can be published until an administrator approves it. The identity document
 * goes to its own private store, so a rejected application still leaves a
 * document only an administrator can open.
 */
export async function applyAsAnalystAction(
  _previous: ActionResult<{ profileId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ profileId: string }>> {
  try {
    const actor = await requireUser();

    const limit = rateLimiter.check(
      `analyst-apply:${actor.userId}`,
      RATE_LIMITS.analystApplication,
    );
    if (!limit.allowed) {
      return fail(ERROR_CODES.RATE_LIMITED);
    }

    const existing = await prisma.analystProfile.findUnique({
      where: { userId: actor.userId },
      select: { status: true },
    });
    if (existing) {
      return fail(
        ERROR_CODES.CONFLICT,
        existing.status === 'REJECTED'
          ? 'თქვენი განაცხადი უკვე განხილულია. ახლის შესატანად დაგვიკავშირდით.'
          : 'განაცხადი უკვე შეტანილია.',
      );
    }

    const parsed = analystApplicationSchema.safeParse({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      displayName: formData.get('displayName'),
      referralSource: formData.get('referralSource'),
      primarySportId: formData.get('primarySportId'),
      headline: formData.get('headline') || undefined,
      bio: formData.get('bio'),
      acceptTerms: formData.get('acceptTerms') === 'on',
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        fieldErrorsFrom(parsed.error),
      );
    }

    const input = parsed.data;

    const sport = await prisma.sport.findFirst({
      where: { id: input.primarySportId, isActive: true },
      select: { id: true },
    });
    if (!sport) {
      return fail(ERROR_CODES.VALIDATION_ERROR, undefined, {
        primarySportId: ['აირჩიეთ ძირითადი მიმართულება.'],
      });
    }

    const document = formData.get('identityDocument');
    if (!(document instanceof File) || document.size === 0) {
      return fail(ERROR_CODES.VALIDATION_ERROR, undefined, {
        identityDocument: ['ატვირთეთ პირადობის დამადასტურებელი დოკუმენტი.'],
      });
    }

    // Stored before the profile row, so a rejected image never leaves a
    // half-built application behind.
    const identityDocumentId = await storeIdentityDocument(document);

    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.analystProfile.create({
        data: {
          userId: actor.userId,
          displayName: input.displayName,
          slug: await uniqueSlug(tx, input.displayName),
          firstName: input.firstName,
          lastName: input.lastName,
          referralSource: input.referralSource,
          primarySportId: sport.id,
          headline: input.headline ?? null,
          bio: input.bio,
          status: 'PENDING',
          termsAcceptedAt: new Date(),
          identityDocumentId,
        },
        select: { id: true },
      });

      // The primary choice is also the first entry in the full sport list, so
      // every query that reads coverage sees it without a special case.
      await tx.analystSport.create({
        data: { analystProfileId: created.id, sportId: sport.id },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.ANALYST_APPLIED,
          entityType: 'AnalystProfile',
          entityId: created.id,
          summary: `ანალიტიკოსის განაცხადი: ${input.displayName}`,
          actorId: actor.userId,
          actorRole: actor.role,
          metadata: { referralSource: input.referralSource },
        },
        tx,
      );

      return created;
    });

    revalidatePath('/admin/analysts');
    return ok({ profileId: profile.id });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * A slug that is free at the moment of insertion.
 *
 * A Georgian display name transliterates to something readable, but two people
 * can still land on the same slug, and a name in an alphabet the map does not
 * cover can produce nothing at all. Both cases fall back to a random suffix
 * rather than failing the application.
 */
async function uniqueSlug(
  tx: Prisma.TransactionClient,
  displayName: string,
): Promise<string> {
  const base = slugify(displayName);
  if (base) {
    const taken = await tx.analystProfile.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!taken) return base;
  }
  return `${base || 'analyst'}-${randomBytes(3).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// The analyst's own subscription plan
// ---------------------------------------------------------------------------

/**
 * The three prices clause 9.1 of the terms allows, in tetri. Not an env
 * knob: the signed document names the numbers, so the code does too.
 */
const PLAN_PRICES_MINOR = [3000, 4000, 5000] as const;

/**
 * Create or reprice the analyst's monthly plan.
 *
 * This is the missing half of approval: an approved analyst with no plan
 * cannot be subscribed to, and nothing else in the product creates one -
 * approval cannot, because the price is the author's choice, not the
 * administrator's. One PREMIUM plan per analyst, monthly, at one of the
 * three prices the signed terms allow.
 *
 * Repricing NEVER touches an existing subscriber: a UserSubscription owns
 * its own record of what was bought, and the gateway renews on the schedule
 * it was given at checkout. The new price applies to the next person who
 * subscribes.
 */
export async function setPlanPriceAction(
  _previous: ActionResult<{ priceMinor: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ priceMinor: number }>> {
  try {
    const actor = await requireApprovedAnalyst();

    const priceMinor = Number(formData.get('priceMinor'));
    if (!PLAN_PRICES_MINOR.includes(priceMinor as 3000 | 4000 | 5000)) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'ფასი უნდა იყოს 30, 40 ან 50 ლარი თვეში.',
      );
    }

    const profile = await prisma.analystProfile.findUniqueOrThrow({
      where: { id: actor.analystProfileId },
      select: { id: true, displayName: true },
    });

    const existing = await prisma.subscriptionPlan.findFirst({
      where: { analystProfileId: profile.id, tier: 'PREMIUM' },
      select: { id: true, priceMinor: true },
    });

    const plan = existing
      ? await prisma.subscriptionPlan.update({
          where: { id: existing.id },
          data: { priceMinor, isActive: true },
          select: { id: true },
        })
      : await prisma.subscriptionPlan.create({
          data: {
            analystProfileId: profile.id,
            tier: 'PREMIUM',
            nameKa: `${profile.displayName} · Premium`,
            descriptionKa: 'ავტორის ყველა პროგნოზი და ანალიზი.',
            featuresKa: [
              'ავტორის ყველა პროგნოზი',
              'სრული აღწერა და დასაბუთება',
              'შეტყობინება ყოველ ახალ პროგნოზზე',
            ],
            priceMinor,
            currency: 'GEL',
            billingPeriod: 'MONTHLY',
            isActive: true,
            sortOrder: 1,
          },
          select: { id: true },
        });

    await writeAuditLog({
      action: existing
        ? AUDIT_ACTIONS.PLAN_REPRICED
        : AUDIT_ACTIONS.PLAN_CREATED,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      summary: `${profile.displayName}: გამოწერა ${priceMinor / 100} ლარი/თვე${existing ? ` (იყო ${existing.priceMinor / 100})` : ''}`,
      actorId: actor.userId,
      actorRole: actor.role,
    });

    revalidatePath('/analyst');
    revalidatePath('/analysts');
    return ok({ priceMinor });
  } catch (error) {
    return toActionFailure(error);
  }
}
