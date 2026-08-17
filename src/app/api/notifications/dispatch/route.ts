import { timingSafeEqual } from 'node:crypto';
import { getEmailSender } from '@/lib/email';
import { getEnv } from '@/lib/env';
import { dispatchPendingEmails } from '@/lib/notifications/dispatcher';
import { prismaDispatchPort } from '@/lib/notifications/prisma-dispatch-port';

/**
 * Outbox drain endpoint, meant for an external scheduler:
 *
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
 *     https://dajda.ge/api/notifications/dispatch
 *
 * Bearer-secret auth rather than a session: the caller is a cron job, not a
 * person. While CRON_SECRET is unset the endpoint refuses outright, so a
 * deployment cannot be drained (or its SMTP quota burned) by anyone who
 * merely finds the URL.
 */
export const dynamic = 'force-dynamic';

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const env = getEnv();

  if (!env.CRON_SECRET) {
    return Response.json(
      {
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' },
      },
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !secretsMatch(provided, env.CRON_SECRET)) {
    return Response.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Bad secret' } },
      { status: 401 },
    );
  }

  const outcome = await dispatchPendingEmails(
    prismaDispatchPort,
    getEmailSender(),
    env.APP_URL,
  );

  return Response.json({ ok: true, ...outcome });
}
