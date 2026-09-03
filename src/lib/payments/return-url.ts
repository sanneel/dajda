/**
 * Where a buyer lands after the gateway's payment page, and why it is a
 * route of its own rather than the dashboard.
 *
 * Flitt sends the customer back with a POST to `response_url`. The session
 * cookie is SameSite=Lax, and a Lax cookie is not attached to a cross-site
 * POST, so a page that requires a session sees a signed-out visitor and
 * bounces them to /login the moment they have paid. This route requires
 * nothing: it takes the order id, answers 303, and the browser follows with
 * a top-level GET, which does carry the cookie. The destination page then
 * shows the payment banner as before.
 *
 * Pure helpers, so the tests cover the shape without an HTTP server.
 */

const ORDER_ID = /^dajda-[A-Za-z0-9-]+$/;

/** The `response_url` handed to the gateway when a checkout is created. */
export function buildReturnUrl(
  appUrl: string,
  orderId: string,
  destinationPath: string,
): string {
  const url = new URL('/api/payments/return', appUrl);
  url.searchParams.set('order', orderId);
  url.searchParams.set('to', destinationPath);
  return url.toString();
}

/**
 * Only a same-origin path is honoured. Anything that could leave the site -
 * an absolute URL, a protocol-relative `//host`, a backslash trick - falls
 * back to the dashboard, so the return hop can never become an open
 * redirect.
 */
export function safeDestination(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/dashboard';
  }
  return raw;
}

/**
 * The absolute URL to send the browser to. The order id is taken from the
 * query first (we put it there ourselves) and from the gateway's posted
 * `order_id` as a fallback; an id that is not one of ours is dropped rather
 * than echoed into the page.
 */
export function resolveReturnRedirect(
  appUrl: string,
  requestUrl: string,
  postedOrderId: string | null,
): string {
  const incoming = new URL(requestUrl);
  const order = incoming.searchParams.get('order') ?? postedOrderId;
  const target = new URL(safeDestination(incoming.searchParams.get('to')), appUrl);
  if (order && ORDER_ID.test(order)) target.searchParams.set('order', order);
  return target.toString();
}
