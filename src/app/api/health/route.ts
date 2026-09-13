import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { recurringBillingContradicted } from '@/lib/subscriptions/recurring';

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
 *
 * Warnings are for a deployment that serves correctly but is not doing what
 * its operator asked - today, renewals declared on while the published terms
 * still describe one-off payments. That is not an outage and must not answer
 * 503, or a working site would be pulled out of rotation; it is also not
 * nothing, because the operator believes a feature is on that is off.
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

  // Configured, so the declared billing can be compared with the terms.
  const warnings = recurringBillingContradicted() ? ['billing-config'] : [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: 'ok',
      database: 'up',
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error) {
    console.error('[dajda] health check failed', error);
    return Response.json(
      { status: 'degraded', database: 'down', reason: 'database' },
      { status: 503 },
    );
  }
}
