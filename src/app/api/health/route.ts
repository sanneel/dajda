import { prisma } from '@/lib/db';

/**
 * Liveness/readiness probe.
 *
 * Reports whether the database is reachable. Deliberately leaks nothing about
 * the failure - the reason goes to the server log, not the response body.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'up' });
  } catch (error) {
    console.error('[dajda] health check failed', error);
    return Response.json({ status: 'degraded', database: 'down' }, { status: 503 });
  }
}
