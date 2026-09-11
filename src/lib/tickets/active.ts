/**
 * Whether a published, unsettled ticket still counts as active on an author's
 * page.
 *
 * A ticket stops being something to act on the moment its first position
 * kicks off: it can no longer be bought, and a reader who does not hold it
 * has nothing left to follow. So for everybody it is active until the first
 * position starts.
 *
 * Somebody who holds it, the subscriber for a subscription ticket or the buyer
 * for a paid one, is still following it until the last position starts, so
 * for them it stays active that long. A free ticket has no holder and leaves
 * at the first position for everyone.
 *
 * A ticket with no kickoff recorded cannot be judged by the clock, and stays
 * active until it settles.
 */
export function isTicketStillActive(
  ticket: { eventAt: Date | null; eventEndAt: Date | null },
  viewerHoldsIt: boolean,
  now: Date,
): boolean {
  // A single-match ticket has no separate last kickoff: its first is its last.
  const until = viewerHoldsIt
    ? (ticket.eventEndAt ?? ticket.eventAt)
    : ticket.eventAt;
  return until === null || until.getTime() > now.getTime();
}
