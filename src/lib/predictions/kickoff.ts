/**
 * Terms §8.1: a prediction is published before its event starts, and one
 * published after the start does not count in the author's statistics.
 *
 * Both halves live here so the rule the service enforces on publication and
 * the rule the record applies to old rows cannot drift apart.
 */

export const KICKOFF_MISSING_KA = 'მიუთითეთ პირველი მატჩის დრო.';
export const KICKOFF_PASSED_KA =
  'პირველი მატჩი უკვე დაიწყო. დაწყებულ მატჩზე ბილეთი აღარ ქვეყნდება.';

/**
 * Why a ticket cannot be published at `now`, or null when it can.
 *
 * The kickoff is required: without one there is nothing to hold the
 * publication time against, and "no kickoff given" was how a ticket posted
 * after the final whistle got in.
 */
export function kickoffRefusal(
  eventAt: Date | null | undefined,
  now: Date,
): string | null {
  if (!eventAt) return KICKOFF_MISSING_KA;
  if (eventAt.getTime() <= now.getTime()) return KICKOFF_PASSED_KA;
  return null;
}

/**
 * Whether a published ticket counts in the author's record.
 *
 * A row with no kickoff predates the server-side check and nothing proves it
 * late, so it keeps counting. Every ticket published since carries one.
 */
export function countsInRecord(ticket: {
  publishedAt: Date | null;
  eventAt: Date | null;
}): boolean {
  if (!ticket.publishedAt) return false;
  if (!ticket.eventAt) return true;
  return ticket.publishedAt.getTime() < ticket.eventAt.getTime();
}
