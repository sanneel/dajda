import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';

/**
 * Liveness/readiness probe.
 *
 * Reports whether the deployment is configured and whether the database is
 * reachable, and says which of the two failed. Nothing beyond that category
 * reaches the response: the variable that is wrong, and everything about its
 * value, goes to the server log.
 *
 * The distinction is the whole point of the endpoint. A misconfigured
 * deployment answered "database: down" while the database was up and
 * healthy, which sent an afternoon of debugging at the wrong thing. A probe
 * that names the wrong subsystem is worse than one that says nothing.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    getEnv();
  } catch (error) {
    console.error('[dajda] health check: invalid environment', error);
    return Response.json(
      { status: 'degraded', database: 'unknown', reason: 'configuration' },
      { status: 503 },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'up' });
  } catch (error) {
    console.error('[dajda] health check failed', error);
    return Response.json(
      { status: 'degraded', database: 'down', reason: 'database' },
      { status: 503 },
    );
  }
}
