import type { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import type {
  createPredictionSchema,
  editPublishedPredictionSchema,
  settlePredictionSchema,
  correctPredictionSchema,
  markFinishedSchema,
} from '@/lib/validation/schemas';
import { classifyEdit, FROZEN_FIELDS } from './immutability';
import { computeProfitUnitsCenti, type TerminalOutcome } from './settlement';
import { slipTitle } from './slip';

/**
 * The only sanctioned write path for bets.
 *
 * Publication, correction, the author's "this is finished" handoff and admin
 * settlement all funnel through here so that the immutability rule, the audit
 * trail and the edit ledger cannot be sidestepped by a second code path.
 */

type Actor = { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' };

export type CreatePredictionInput = z.output<typeof createPredictionSchema>;
export type EditPredictionInput = z.output<
  typeof editPublishedPredictionSchema
>;
export type SettlePredictionInput = z.output<typeof settlePredictionSchema>;
export type CorrectPredictionInput = z.output<typeof correctPredictionSchema>;
export type MarkFinishedInput = z.output<typeof markFinishedSchema>;

/**
 * Post a bet.
 *
 * The screenshot is required by the schema, so there is no path to a bet with
 * no evidence behind it. Publishing immediately is the normal case; saving a
 * draft first exists so an author can prepare one without it counting.
 */
export async function createPrediction(
  input: CreatePredictionInput,
  analystProfileId: string,
  actor: Actor,
) {
  const sport = await prisma.sport.findUnique({
    where: { id: input.sportId },
    select: { id: true, isActive: true, nameKa: true },
  });
  if (!sport || !sport.isActive) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'სპორტი ვერ მოიძებნა.');
  }

  /*
   * A name is optional on the form - the slip is the bet, and requiring a
   * title only made authors narrate a picture the reader already has open.
   * The column is not nullable and the string is what every list, feed and
   * audit line prints, so a blank one is filled here rather than at the call
   * site: that way a draft, an edit and any future caller all get the same
   * treatment instead of one of them writing an empty title.
   */
  const titleKa =
    input.titleKa && input.titleKa.length > 0
      ? input.titleKa
      : (slipTitle(input.selections) ??
        `${sport.nameKa} · კოეფ. ${(input.odds / 1000).toFixed(2)}`);

  const publishedAt = input.publishNow ? new Date() : null;

  const prediction = await prisma.prediction.create({
    data: {
      authorId: analystProfileId,
      // Who physically uploaded it, kept even if the profile is later removed.
      postedById: actor.userId,
      sportId: sport.id,
      screenshotPath: input.screenshotPath,
      extraScreenshotPaths: input.extraScreenshotPaths,
      titleKa,
      descriptionKa: input.descriptionKa ?? null,
      // Already scaled by the schema: oddsSchema returns milli. Multiplying
      // again here would store 1.85 as 1850.00.
      oddsMilli: input.odds,
      /*
       * Stake is no longer asked for and no longer shown: every ticket is one
       * unit. The column stays because profit is denominated in units and the
       * settled history was computed that way, so it keeps its default rather
       * than becoming a nullable field nothing sets.
       */
      confidence: input.confidence,
      visibility: input.visibility,
      /*
       * Only the singly-buyable type carries a price. Free has none, and
       * subscription-only is not for sale on its own - so a stray price from
       * a hand-edited form is dropped rather than stored.
       */
      priceMinor: input.visibility === 'PREMIUM' ? (input.price ?? null) : null,
      eventAt: input.eventAt ?? null,
      eventEndAt: input.eventEndAt ?? null,
      publishedAt,
      // The legs, in slip order. What every public page renders.
      selections: {
        create: input.selections.map((leg, index) => ({
          position: index + 1,
          eventKa: leg.eventKa,
          pickKa: leg.pickKa,
          oddsMilli: leg.odds,
        })),
      },
    },
  });

  await writeAuditLog({
    action: publishedAt
      ? AUDIT_ACTIONS.PREDICTION_PUBLISHED
      : AUDIT_ACTIONS.PREDICTION_CREATED,
    entityType: 'Prediction',
    entityId: prediction.id,
    summary: publishedAt
      ? `ფსონი გამოქვეყნდა: ${titleKa}`
      : `ფსონის მონახაზი: ${titleKa}`,
    actorId: actor.userId,
    actorRole: actor.role,
  });

  return prediction;
}

/** Move a draft to published. Irreversible: publication starts the record. */
export async function publishPrediction(predictionId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const prediction = await tx.prediction.findUnique({
      where: { id: predictionId },
      select: { id: true, titleKa: true, publishedAt: true, authorId: true },
    });
    if (!prediction) throw new AppError(ERROR_CODES.NOT_FOUND);
    if (prediction.publishedAt) {
      throw new AppError(ERROR_CODES.CONFLICT, 'უკვე გამოქვეყნებულია.');
    }

    const updated = await tx.prediction.update({
      where: { id: predictionId },
      data: { publishedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PREDICTION_PUBLISHED,
        entityType: 'Prediction',
        entityId: predictionId,
        summary: `ფსონი გამოქვეყნდა: ${prediction.titleKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
      },
      tx,
    );

    return updated;
  });
}

/**
 * The author marks a published bet as finished and hands it to an admin.
 *
 * This never sets the outcome. Only an admin decides won or lost, so "the
 * author said it was over" and "an admin verified it" stay separate facts and
 * both remain answerable from the record.
 */
export async function markPredictionFinished(
  input: MarkFinishedInput,
  analystProfileId: string,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const prediction = await tx.prediction.findUnique({
      where: { id: input.predictionId },
      select: {
        id: true,
        titleKa: true,
        authorId: true,
        publishedAt: true,
        finishedAt: true,
        status: true,
        supersededAt: true,
      },
    });
    if (!prediction) throw new AppError(ERROR_CODES.NOT_FOUND);

    // Ownership is checked against the session's analyst profile, never
    // against an id supplied by the form.
    if (prediction.authorId !== analystProfileId && actor.role !== 'ADMIN') {
      throw new AppError(ERROR_CODES.FORBIDDEN);
    }
    if (!prediction.publishedAt) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'გამოუქვეყნებელი ფსონი ვერ დასრულდება.',
      );
    }
    if (prediction.status !== 'PENDING' || prediction.supersededAt) {
      throw new AppError(ERROR_CODES.CONFLICT, 'ფსონი უკვე დათვლილია.');
    }

    const updated = await tx.prediction.update({
      where: { id: prediction.id },
      data: {
        finishedAt: prediction.finishedAt ?? new Date(),
        ...(input.resultScreenshotPath
          ? { resultScreenshotPath: input.resultScreenshotPath }
          : {}),
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PREDICTION_FINISHED,
        entityType: 'Prediction',
        entityId: prediction.id,
        summary: `ავტორმა დაასრულა: ${prediction.titleKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: { hasResultScreenshot: Boolean(input.resultScreenshotPath) },
      },
      tx,
    );

    return updated;
  });
}

/**
 * Edit a bet.
 *
 * Before publication anything may change. After it, only the presentation
 * fields, and every attempt is written to the ledger, including the refused
 * ones. The refusals are the point: they evidence that the published record
 * was not quietly rewritten.
 */
export async function editPrediction(
  predictionId: string,
  input: EditPredictionInput,
  actor: Actor,
) {
  return prisma.$transaction(async (tx) => {
    const prediction = await tx.prediction.findUnique({
      where: { id: predictionId },
      select: {
        id: true,
        authorId: true,
        publishedAt: true,
        titleKa: true,
        descriptionKa: true,
        confidence: true,
        visibility: true,
        screenshotPath: true,
        oddsMilli: true,
        stakeUnitsCenti: true,
        sportId: true,
      },
    });
    if (!prediction) throw new AppError(ERROR_CODES.NOT_FOUND);

    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof EditPredictionInput] !== undefined,
    );
    const classification = classifyEdit(prediction, changedFields);

    if (classification.outcome === 'REJECTED_IMMUTABLE') {
      await tx.predictionEdit.create({
        data: {
          predictionId,
          actorId: actor.userId,
          outcome: 'REJECTED_IMMUTABLE',
          reason: classification.reason,
          changedFields,
          previousValue: pick(prediction, FROZEN_FIELDS),
          attemptedValue: input as Prisma.InputJsonValue,
        },
      });
      throw new AppError(ERROR_CODES.CONFLICT, classification.reason);
    }

    const updated = await tx.prediction.update({
      where: { id: predictionId },
      data: input,
    });

    await tx.predictionEdit.create({
      data: {
        predictionId,
        actorId: actor.userId,
        outcome: 'APPLIED',
        changedFields,
        previousValue: pick(prediction, changedFields as never),
        attemptedValue: input as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

/**
 * Issue a correction.
 *
 * The original row is never mutated. It is superseded and stays publicly
 * readable, and a new version links back to it, so a reader can always see
 * what was originally claimed.
 */
export async function correctPrediction(
  input: CorrectPredictionInput,
  actor: Actor & { role: 'ADMIN' },
) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.prediction.findUnique({
      where: { id: input.predictionId },
      select: {
        id: true,
        authorId: true,
        sportId: true,
        postedById: true,
        screenshotPath: true,
        resultScreenshotPath: true,
        titleKa: true,
        descriptionKa: true,
        oddsMilli: true,
        stakeUnitsCenti: true,
        confidence: true,
        visibility: true,
        publishedAt: true,
        eventAt: true,
        finishedAt: true,
        version: true,
        supersededAt: true,
        isDemo: true,
        selections: {
          orderBy: { position: 'asc' },
          select: { position: true, eventKa: true, pickKa: true, oddsMilli: true },
        },
      },
    });
    if (!original) throw new AppError(ERROR_CODES.NOT_FOUND);
    if (!original.publishedAt) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'მონახაზს შესწორება არ სჭირდება: უბრალოდ დაარედაქტირეთ.',
      );
    }
    if (original.supersededAt) {
      throw new AppError(ERROR_CODES.CONFLICT, 'უკვე შესწორებულია.');
    }

    const correction = await tx.prediction.create({
      data: {
        authorId: original.authorId,
        postedById: original.postedById,
        sportId: original.sportId,
        screenshotPath: input.screenshotPath ?? original.screenshotPath,
        resultScreenshotPath: original.resultScreenshotPath,
        titleKa: input.titleKa ?? original.titleKa,
        descriptionKa: input.descriptionKa ?? original.descriptionKa,
        oddsMilli: input.odds ?? original.oddsMilli,
        stakeUnitsCenti: original.stakeUnitsCenti,
        confidence: original.confidence,
        visibility: original.visibility,
        publishedAt: new Date(),
        eventAt: original.eventAt,
        finishedAt: original.finishedAt,
        version: original.version + 1,
        correctionOfId: original.id,
        isDemo: original.isDemo,
        // The legs travel with the claim: the new version shows the same
        // ticket, and the original keeps its own copy.
        selections: { create: original.selections },
      },
    });

    await tx.prediction.update({
      where: { id: original.id },
      data: { supersededAt: new Date() },
    });

    await tx.predictionEdit.create({
      data: {
        predictionId: original.id,
        actorId: actor.userId,
        outcome: 'APPLIED_AS_CORRECTION',
        reason: input.reason,
        changedFields: Object.keys(input).filter(
          (k) => k !== 'predictionId' && k !== 'reason',
        ),
        previousValue: pick(original, FROZEN_FIELDS),
        attemptedValue: input as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PREDICTION_CORRECTED,
        entityType: 'Prediction',
        entityId: correction.id,
        summary: `ფსონი შესწორდა (v${original.version} -> v${correction.version}): ${input.reason}`,
        actorId: actor.userId,
        actorRole: 'ADMIN',
      },
      tx,
    );

    return correction;
  });
}

/** Record the outcome. Admin only, and only once. */
export async function settlePrediction(
  input: SettlePredictionInput,
  actor: Actor & { role: 'ADMIN' },
) {
  return prisma.$transaction(async (tx) => {
    const prediction = await tx.prediction.findUnique({
      where: { id: input.predictionId },
      select: {
        id: true,
        titleKa: true,
        status: true,
        publishedAt: true,
        supersededAt: true,
        oddsMilli: true,
        stakeUnitsCenti: true,
      },
    });
    if (!prediction) throw new AppError(ERROR_CODES.NOT_FOUND);
    if (!prediction.publishedAt) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'გამოუქვეყნებელი ფსონი ვერ დაითვლება.',
      );
    }
    if (prediction.supersededAt) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'შესწორებული ვერსია ვერ დაითვლება: დათვალეთ მოქმედი ვერსია.',
      );
    }
    if (prediction.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.CONFLICT, 'ფსონი უკვე დათვლილია.');
    }

    const outcome = input.outcome as TerminalOutcome;
    const profitUnitsCenti = computeProfitUnitsCenti(
      outcome,
      prediction.oddsMilli,
      prediction.stakeUnitsCenti,
    );

    await tx.predictionResult.create({
      data: {
        predictionId: prediction.id,
        outcome,
        profitUnitsCenti,
        actualValueMilli:
          input.actualValue === undefined
            ? null
            : Math.round(input.actualValue * 1000),
        settlementSource: input.settlementSource,
        note: input.note ?? null,
        settledById: actor.userId,
      },
    });

    const updated = await tx.prediction.update({
      where: { id: prediction.id },
      data: { status: outcome, finishedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PREDICTION_SETTLED,
        entityType: 'Prediction',
        entityId: prediction.id,
        summary: `ფსონი დაითვალა: ${outcome} (${prediction.titleKa})`,
        actorId: actor.userId,
        actorRole: 'ADMIN',
        metadata: {
          profitUnitsCenti,
          settlementSource: input.settlementSource,
        },
      },
      tx,
    );

    return updated;
  });
}

/** Snapshot a subset of fields for the edit ledger's before/after columns. */
function pick<T extends object, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Prisma.InputJsonValue {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) result[String(key)] = source[key];
  }
  return result as Prisma.InputJsonValue;
}
