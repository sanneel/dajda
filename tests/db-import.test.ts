import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/*
 * A build must not need a database.
 *
 * `next build` imports every route module to read its configuration, which
 * reaches src/lib/db. While the client was constructed at import time, that
 * import called getEnv(), so a build machine with no DATABASE_URL - a CI
 * runner, a preview deployment whose database variables are scoped to
 * production - failed after compiling the entire application, on a file
 * nobody had asked to run a query. These tests pin both halves of the fix:
 * importing is free, and the first query still refuses a missing environment.
 */

const DB_KEYS = ['DATABASE_URL', 'DATABASE_POOL_MAX', 'AUTH_SECRET'] as const;

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  for (const key of DB_KEYS) delete process.env[key];
  resetEnvCache();
});

afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('importing the database client', () => {
  it('needs no environment at all', async () => {
    await expect(import('@/lib/db')).resolves.toHaveProperty('prisma');
  });

  it('still refuses the first use without one', async () => {
    const { prisma } = await import('@/lib/db');

    // Thrown where the client is first touched, which in a route handler is
    // inside the async body and reaches the caller as a rejection.
    expect(() => prisma.sport.count()).toThrow(
      /Invalid environment configuration[\s\S]*DATABASE_URL/,
    );
  });

  it('builds one client per process, not one per property access', async () => {
    /*
     * The reason this is worth a test: the deferred client is reached through
     * a proxy, so "cached" has to mean cached in the module, not only on
     * globalThis. Caching only on globalThis works in development and opens a
     * fresh connection pool on every property access in production, which
     * exhausts the database instead of connecting to it.
     */
    // NODE_ENV is typed read-only, and production is exactly the mode that
    // had the bug: nothing writes to globalThis there. DEMO_MODE waives the
    // payment and email checks so the rest of the production guard does not
    // need a full merchant configuration here.
    const env = process.env as Record<string, string | undefined>;
    env.DATABASE_URL = 'postgresql://user:pass@db.internal:5432/dajda';
    env.AUTH_SECRET = 'x'.repeat(32);
    env.NODE_ENV = 'production';
    env.DEMO_MODE = 'true';
    env.APP_URL = 'https://dajda.ge';
    resetEnvCache();

    const { prisma } = await import('@/lib/db');

    // Connecting is lazy in Prisma, so touching delegates never opens a
    // socket; what this compares is the client object behind each access.
    expect(prisma.sport).toBe(prisma.sport);
    expect(prisma.prediction).toBe(prisma.prediction);
  });
});
