import { getEnv } from '@/lib/env';
import { resolveReturnRedirect } from '@/lib/payments/return-url';

export const dynamic = 'force-dynamic';

/**
 * The gateway's `response_url`. See lib/payments/return-url.ts for why the
 * buyer cannot be sent straight to the dashboard.
 *
 * No session, no CSRF: this endpoint changes nothing. The payment itself is
 * granted only by the signed server callback; this hop just carries the
 * order id across the cross-site boundary so the page can show its status.
 */
async function postedOrderId(request: Request): Promise<string | null> {
  if (request.method !== 'POST') return null;
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = (await request.json()) as { order_id?: unknown };
      return typeof body.order_id === 'string' ? body.order_id : null;
    }
    const form = await request.formData();
    const value = form.get('order_id');
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function handle(request: Request): Promise<Response> {
  const location = resolveReturnRedirect(
    getEnv().APP_URL,
    request.url,
    await postedOrderId(request),
  );
  // 303: the browser re-requests with GET whatever the method was.
  return new Response(null, { status: 303, headers: { Location: location } });
}

export const GET = handle;
export const POST = handle;
