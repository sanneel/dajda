/**
 * Ephemeral PostgreSQL server for local development and verification.
 *
 * Runs a real Postgres (PGlite, the official WASM build) over a TCP socket, so
 * `prisma migrate deploy`, `prisma db seed` and the app itself can connect
 * normally - no Docker daemon and no system Postgres install required.
 *
 * This is a development convenience only. Production uses a real PostgreSQL
 * server; see docker-compose.yml or your managed provider.
 *
 *   node scripts/dev-db.mjs [--port 5432] [--dir ./.pgdata]
 *
 * Pass --dir to persist data between runs; omit it for a throwaway in-memory
 * database that is discarded on exit.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const port = Number(arg('port', 5432));
const dataDir = arg('dir', undefined);

const db = await PGlite.create(dataDir ? { dataDir } : undefined);

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();

console.info(
  `dev database listening on postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
);
console.info(dataDir ? `persisting to ${dataDir}` : 'in-memory (not persisted)');

async function shutdown() {
  await server.stop();
  await db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
