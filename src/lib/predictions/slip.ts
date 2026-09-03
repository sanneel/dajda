/**
 * The legs of a bet, apart from the database and the form.
 *
 * A slip is a list of selections, each with its own odds. What the public
 * sees is built from these rows, never from the bookmaker's screenshot, so
 * the rules for deriving a title and a combined price from them live here
 * where a test can hold them still.
 */

export type SlipSelection = {
  eventKa: string;
  pickKa: string;
  oddsMilli: number;
};

/** Raw rows as they arrive from the form, before the schema sees them. */
export type SelectionDraft = {
  eventKa: string;
  pickKa: string;
  odds: string;
};

/** Field names the post form uses for its repeated rows. */
export const SELECTION_FIELDS = {
  event: 'selectionEvent',
  pick: 'selectionPick',
  odds: 'selectionOdds',
} as const;

/**
 * The accumulator's price: every leg multiplied, in thousandths.
 *
 * Multiplied in floating point and rounded once at the end, which is how a
 * bookmaker prints it. An empty list is 1.00, so a caller can always divide.
 */
export function combinedOddsMilli(
  legs: readonly { oddsMilli: number }[],
): number {
  if (legs.length === 0) return 1000;
  const product = legs.reduce((acc, leg) => acc * (leg.oddsMilli / 1000), 1);
  return Math.round(product * 1000);
}

/**
 * A title for a bet the author did not name.
 *
 * One leg reads as "match · pick". More read as the first leg plus how many
 * follow, so a list stays scannable and a five-leg ticket does not become a
 * paragraph in a table cell.
 */
export function slipTitle(
  legs: readonly { eventKa: string; pickKa: string }[],
): string | null {
  const first = legs[0];
  if (!first) return null;
  const head = `${first.eventKa} · ${first.pickKa}`;
  return legs.length === 1 ? head : `${head} +${legs.length - 1}`;
}

/**
 * Zip the repeated row fields back into rows.
 *
 * A row the author added and left entirely blank is dropped rather than
 * failing validation; a half-filled one is kept so the schema can say which
 * half is missing.
 */
export function selectionsFromFormData(formData: FormData): SelectionDraft[] {
  const events = formData.getAll(SELECTION_FIELDS.event).map(String);
  const picks = formData.getAll(SELECTION_FIELDS.pick).map(String);
  const odds = formData.getAll(SELECTION_FIELDS.odds).map(String);
  const count = Math.max(events.length, picks.length, odds.length);

  const rows: SelectionDraft[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = {
      eventKa: (events[i] ?? '').trim(),
      pickKa: (picks[i] ?? '').trim(),
      odds: (odds[i] ?? '').trim(),
    };
    if (row.eventKa || row.pickKa || row.odds) rows.push(row);
  }
  return rows;
}
