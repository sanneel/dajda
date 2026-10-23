/**
 * The referral cookie, in a module of its own so the proxy can set it without
 * importing anything that reaches the database.
 *
 * An analyst's link is `?ref=<their slug>`. The proxy keeps the code for 30
 * days, so a visitor who looks today and signs up next week still counts; a
 * newer link replaces an older one. The code is only a hint until sign-up,
 * where it is checked against an approved analyst.
 */
export const REFERRAL_COOKIE = 'dajda_ref';
export const REFERRAL_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A well-formed slug, lowercased, or null. */
export function parseReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(code) ? code : null;
}
