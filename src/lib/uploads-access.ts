/**
 * Who may fetch a stored image, as a pure rule.
 *
 * `/uploads/<name>` used to answer everybody, on the reasoning that a slip is
 * the evidence behind a public record. For a paid ticket it is not: the slip
 * IS the pick, the page withholds it from anyone who has not paid, and the
 * route handed it to anyone holding the link. A buyer who shared the address
 * shared the ticket with everyone, for good, from a CDN cache.
 *
 * So the route now asks the same question the ticket page asks, per viewer,
 * and says how the answer may be cached:
 *
 *   public   the image is open to everybody (a settled free ticket, an
 *            analyst's photo, anything no ticket claims): cache it anywhere
 *   private  this viewer may see it and others may not: never cache it
 *   denied   this viewer may not see it
 *
 * A slip follows the ticket's lock (lib/auth/entitlements). A result photo is
 * the author's proof for the administrator and never public: the ticket page
 * shows it to those two only, and so does this.
 */

export type ImageAccess = 'public' | 'private' | 'denied';

export type SlipUse = {
  /** Locked for this viewer, per isTicketLocked. */
  lockedForViewer: boolean;
  /** Locked for a signed-out stranger, per isTicketLocked. */
  lockedForEveryone: boolean;
};

export type ResultUse = {
  /** The viewer is an administrator, the poster or the author. */
  visibleToViewer: boolean;
};

export function imageAccess(input: {
  slips: readonly SlipUse[];
  results: readonly ResultUse[];
}): ImageAccess {
  const { slips, results } = input;

  // Nothing claims it: a profile photo, or an upload not attached to a ticket.
  if (slips.length === 0 && results.length === 0) return 'public';

  // A result photo is never public, whatever else uses the same file.
  if (results.length === 0 && slips.some((slip) => !slip.lockedForEveryone)) {
    return 'public';
  }

  if (
    slips.some((slip) => !slip.lockedForViewer) ||
    results.some((result) => result.visibleToViewer)
  ) {
    return 'private';
  }

  return 'denied';
}
