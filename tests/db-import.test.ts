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
});
