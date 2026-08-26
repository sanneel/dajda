import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { flushEmailOutbox } from '@/lib/notifications/email-sender';
import { flushTelegramOutbox } from '@/lib/notifications/telegram-sender';

/**
 * The outbox sweep.
 *
 * A broadcast delivers its own copies inline, so this is the second pass, and
 * it is what makes the queue honest rather than decorative: it retries what
 * failed transiently, and it is the ONLY thing that ever sends the
 * notifications nothing waits on - a new bet, a settlement, a live notice -
 * because no user is sitting in front of those.
 *
 * Point a scheduler at it every few minutes:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" https://host/api/cron/notifications
 *
 * Authenticated by a bearer secret, not by obscurity of the path. Without
 * CRON_SECRET set it refuses everyone, so an unconfigured deployment cannot be
 * made to flush its backlog by anyone who guesses the address.
 */
export const dynamic = 'force-dynamic';

/** Bounded per call so one sweep cannot run for minutes. */
const PER_CHANNEL_LIMIT = 100;

export async function POST(request: Request) {
  return handle(request);
}

/**
 * GET is accepted too, because most schedulers only speak GET. It is safe to
 * expose on this one: the work is idempotent in the way that matters - a row
 * already SENT is never selected again, so a double-fired cron cannot send
 * anything twice.
 */
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

  const [telegram, email] = await Promise.all([
    flushTelegramOutbox({ limit: PER_CHANNEL_LIMIT }),
    flushEmailOutbox({ limit: PER_CHANNEL_LIMIT }),
  ]);

  return Response.json({ ok: true, data: { telegram, email } });
}

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
