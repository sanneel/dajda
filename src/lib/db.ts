import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from './env';

/**
 * Prisma 7 requires an explicit driver adapter; the connection string no
 * longer lives in schema.prisma.
 *
 * The client is cached on globalThis so that Next's dev-mode module reloading
 * does not open a new connection pool on every edit.
 */
const globalForPrisma = globalThis as unknown as {
  dajdaPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const env = getEnv();

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // TCP keepalive on every pooled socket. Both the PGlite dev server and
    // pooled cloud Postgres silently drop idle connections; without probes
    // the first query on a dead socket surfaces as "Connection terminated
    // unexpectedly" instead of a clean reconnect.
    keepAlive: true,
    ...(env.DATABASE_POOL_MAX
      ? {
          max: env.DATABASE_POOL_MAX,
          /*
           * Capping the pool is only done against the single-connection
           * development server (scripts/dev-db.mjs). There, holding an idle
           * connection open would lock out migrations, the seed and the
           * verification scripts, so idle connections are released promptly.
           */
          idleTimeoutMillis: 1_000,
        }
      : {}),
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.dajdaPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.dajdaPrisma = prisma;
}
