import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { sweepStaleCheckouts } from '@/lib/payments/sweep';

/**
 * The stale checkout sweep: see lib/payments/sweep.ts.
 *
 * Point a scheduler at it once a day, or more often:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" https://host/api/cron/payments
 *
 * Same bearer-secret gate as the notifications cron: without CRON_SECRET it
 * refuses everyone. Safe to fire twice: every change goes through the
 * webhook rules, which absorb a repeated event and refuse a repeated
 * transition.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'CRON_SECRET unset.' } },
      { status: 503 },
    );
  }

  const presented = (request.headers.get('authorization') ?? '').replace(
    /^Bearer\s+/i,
    '',
  );
  if (!secretMatches(presented, secret)) {
    return Response.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden.' } },
      { status: 401 },
    );
  }

  const report = await sweepStaleCheckouts();
  return Response.json({ ok: true, data: report });
}

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
