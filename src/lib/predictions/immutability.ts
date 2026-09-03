/**
 * Which parts of a prediction are frozen once it is published.
 *
 * A published prediction is the evidence behind an analyst's public record. If
 * odds, line or selection could be edited afterwards, every statistic on the
 * platform would be unfalsifiable. So after publication those fields are
 * writable only by issuing a *correction*, which creates a new version and
 * leaves the original row intact and still visible.
 */

/**
 * Frozen from the moment `publishedAt` is set.
 *
 * `screenshotPath` is the most important entry: the uploaded slip IS the
 * evidence. If an author could swap the image after publishing, the record
 * would be worth nothing, so a replacement has to go through a correction that
 * keeps the original image reachable.
 *
 * The legs (`PredictionSelection` rows) are frozen the same way, by having no
 * write path at all after creation: the edit form never touches them, and a
 * correction copies them onto the new version.
 */
export const FROZEN_FIELDS = [
  'authorId',
  'sportId',
  'screenshotPath',
  'oddsMilli',
  'stakeUnitsCenti',
  'publishedAt',
] as const;

export type FrozenField = (typeof FROZEN_FIELDS)[number];

/**
 * Fields that stay editable after publication.
 *
 * `resultScreenshotPath` and `finishedAt` are here because they are written
 * AFTER the event, by the author, to hand the bet to an admin. They are not
 * part of the claim being frozen; they are the author saying "this is over,
 * here is the proof". The outcome itself is still admin-only.
 */
export const EDITABLE_AFTER_PUBLISH = [
  'titleKa',
  'descriptionKa',
  'confidence',
  'visibility',
  'eventAt',
  'finishedAt',
  'resultScreenshotPath',
] as const;

export type EditableField = (typeof EDITABLE_AFTER_PUBLISH)[number];

const FROZEN_SET = new Set<string>(FROZEN_FIELDS);
const EDITABLE_SET = new Set<string>(EDITABLE_AFTER_PUBLISH);

export type EditClassification =
  | { outcome: 'APPLIED'; frozenAttempted: [] }
  | { outcome: 'REJECTED_IMMUTABLE'; frozenAttempted: string[]; reason: string };

/**
 * Decide whether a set of changed field names may be applied directly.
 *
 * Pure, so the rule can be asserted in tests and reused by both the analyst
 * edit form and the admin tooling - there is no second, laxer code path.
 */
export function classifyEdit(
  prediction: { publishedAt: Date | null },
  changedFields: readonly string[],
): EditClassification {
  // Unpublished drafts are freely editable - nothing has been claimed yet.
  if (prediction.publishedAt === null) {
    return { outcome: 'APPLIED', frozenAttempted: [] };
  }

  const frozenAttempted = changedFields.filter(
    (field) => FROZEN_SET.has(field) || !EDITABLE_SET.has(field),
  );

  if (frozenAttempted.length > 0) {
    return {
      outcome: 'REJECTED_IMMUTABLE',
      frozenAttempted,
      reason: `გამოქვეყნებული ფსონის ველები უცვლელია: ${frozenAttempted.join(', ')}. საჭიროა შესწორების პროცედურა.`,
    };
  }

  return { outcome: 'APPLIED', frozenAttempted: [] };
}

/** A settled prediction is closed even to presentation edits. */
export function isEditable(prediction: {
  publishedAt: Date | null;
  status: string;
  supersededAt: Date | null;
}): boolean {
  if (prediction.supersededAt !== null) return false;
  return prediction.status === 'PENDING';
}
