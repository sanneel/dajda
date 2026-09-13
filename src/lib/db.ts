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

/** The client behind the export, built at most once per process. */
function client(): PrismaClient {
  const existing = globalForPrisma.dajdaPrisma;
  if (existing) return existing;

  const created = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.dajdaPrisma = created;
  }
  return created;
}

/**
 * Built on first use, not on import.
 *
 * `next build` imports every route module to read its configuration, and
 * importing one of these reached this file. Constructing the client here calls
 * getEnv(), so a build machine with no DATABASE_URL - a CI runner, a preview
 * deployment whose database variables are scoped to production - died while
 * collecting page data, having compiled the whole application successfully.
 * Nothing queried anything; the import alone was fatal.
 *
 * The requirement itself is not relaxed: the first real query still calls
 * getEnv() and still refuses to run without a configured environment, with the
 * same message. It is only no longer asked at a moment when the answer cannot
 * exist and nobody needs it. Same reasoning as prisma.config.ts, which already
 * attaches the datasource only when a URL is actually present.
 *
 * A Proxy rather than a getter because every call site does
 * `import { prisma }` and uses it as the client itself.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property) as unknown;
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  has(_target, property) {
    return Reflect.has(client(), property);
  },
});
