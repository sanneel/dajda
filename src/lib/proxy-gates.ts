/**
 * Answers the proxy can give before any page renders.
 *
 * Every page now streams (the loading states), and a page that has started
 * streaming can no longer change its status code: a signed-out visitor on
 * /account got 200 and an in-page redirect, and the dev checkout in
 * production got 200 and a "not found" body. Deciding these two cases here,
 * before the render, restores a real 307 and a real 404.
 *
 * NOT ACCESS CONTROL. The cookie is only checked for presence, not validity;
 * a forged or expired one passes here and is refused by the layout's
 * requireUser()/requireAdmin(), exactly as before. This only spares a
 * visitor with no session at all a render that ends in a redirect.
 *
 * Pure, so the path list is pinned by a test.
 */

export type EarlyGate = { redirect: string } | { notFound: true } | null;

/** Areas that send a signed-out visitor to /login. `/analysts` is public. */
const SIGNED_IN_ONLY = /^\/(account|admin|analyst|apply|feed)(\/|$)/;

/** The payment simulator. It exists only while the mock provider is on. */
const DEV_ONLY = /^\/dev(\/|$)/;

export function earlyGate(
  pathname: string,
  context: { hasSessionCookie: boolean; paymentProvider: string | undefined },
): EarlyGate {
  if (DEV_ONLY.test(pathname) && context.paymentProvider !== 'mock') {
    return { notFound: true };
  }
  if (!context.hasSessionCookie && SIGNED_IN_ONLY.test(pathname)) {
    return { redirect: '/login' };
  }
  return null;
}
