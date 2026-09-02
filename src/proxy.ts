import { NextResponse, type NextRequest } from 'next/server';
import { canonicalRedirect } from '@/lib/canonical-host';

/**
 * Two jobs, in order: send the `www.` twin of the public host to the one
 * host the session cookie lives on, then stamp a per-request
 * Content-Security-Policy with a fresh nonce.
 *
 * Next reads the nonce from the incoming `x-nonce` header and stamps it onto
 * the scripts it injects, so `strict-dynamic` can be used without allowing
 * arbitrary inline script. `unsafe-inline` is listed only as a fallback for
 * browsers that do not understand nonces; they ignore it when a nonce is
 * present.
 *
 * NOTE ON AUTH: this layer performs NO access control. It runs before any
 * database lookup and cannot tell a valid session from a forged cookie, so it
 * must never be relied on to protect a route. Every protected page and action
 * re-checks the session server-side via requireUser()/requireAdmin().
 */
export function proxy(request: NextRequest) {
  /*
   * Read straight from process.env rather than through getEnv(): this runs
   * on every request before anything else, and a missing APP_URL must mean
   * "no redirect", not a crash in front of the whole site. Behind the
   * platform's proxy the browser's host arrives in X-Forwarded-Host.
   *
   * 308 rather than 301 so a form POST or a Server Action that somehow lands
   * on the wrong host is replayed as a POST on the right one, not downgraded
   * to a GET.
   */
  const target = canonicalRedirect({
    requestHost:
      request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    appUrl: process.env.APP_URL ?? '',
  });
  if (target) return NextResponse.redirect(target, 308);

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    `default-src 'self'`,
    // 'unsafe-eval' is required by the dev-mode React refresh runtime only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self' data:`,
    // No third-party analytics, no remote API: the app talks only to itself.
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    /*
     * Not in development. The directive upgrades every subresource to https,
     * and browsers exempt only "potentially trustworthy" hosts (localhost)
     * from it - so a dev server opened from a phone over the LAN, e.g.
     * http://192.168.x.x:3000, serves an HTML page whose every stylesheet
     * and script is silently rewritten to an https URL nothing answers.
     * The page renders naked and the server logs nothing, because the
     * requests never arrive.
     */
    isDev ? '' : `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join('; ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the webhook endpoint - a CSP header
     * on a server-to-server callback is pointless overhead.
     */
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
