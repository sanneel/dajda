import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy with a fresh nonce.
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
    `upgrade-insecure-requests`,
  ]
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
