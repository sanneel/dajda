/**
 * One public host.
 *
 * The session cookie is scoped to the host that set it, so `www.dajda.ge`
 * and `dajda.ge` are two different logins to a browser. That is merely
 * confusing on the site and outright expensive at checkout: the payment
 * return URL is built from APP_URL, so somebody who signed in on the other
 * spelling comes back from the bank to a page with no session and reads
 * "paid, not activated" while the webhook has in fact activated it.
 *
 * The fix is one canonical host, enforced at the edge with a permanent
 * redirect rather than by widening the cookie to `.dajda.ge`: a domain
 * cookie would also be sent to every future subdomain, and it would still
 * leave two addresses for the same page in links, previews and analytics.
 *
 * Deliberately narrow. Only the `www.` twin of the canonical host is
 * redirected - never localhost, a LAN address, or a preview deployment on
 * the platform's own domain, all of which must keep serving the app as they
 * are. Pure, so the rule is pinned by a test without a request in hand.
 */

/** Hostname only: no port, lowercase. */
function bareHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * The URL to redirect to, or null when the request is already on the
 * canonical host or on a host this rule does not cover.
 */
export function canonicalRedirect(input: {
  /** The host the browser asked for, as sent in Host or X-Forwarded-Host. */
  requestHost: string | null | undefined;
  pathname: string;
  search: string;
  appUrl: string;
}): string | null {
  if (!input.requestHost) return null;

  let canonical: URL;
  try {
    canonical = new URL(input.appUrl);
  } catch {
    return null;
  }

  const wanted = bareHost(canonical.hostname);
  const actual = bareHost(input.requestHost);
  if (actual === wanted) return null;

  const isTwin =
    actual === `www.${wanted}` || (wanted.startsWith('www.') && `www.${actual}` === wanted);
  if (!isTwin) return null;

  return `${canonical.origin}${input.pathname}${input.search}`;
}
