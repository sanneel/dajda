/**
 * Smoke test over every page the product actually has.
 *
 * The unit suite is deliberately database-free, which is the right trade for
 * business rules and the wrong one for the failures that have actually taken
 * this site down. Those were never a wrong calculation; they were a page that
 * stopped rendering - a module that read the environment at import time, a
 * client rebuilt on every property access, a component moved without its
 * import, a contradictory pair of environment variables. Every one of them
 * typechecks, lints, and passes the whole unit suite.
 *
 * So this drives the BUILT application over HTTP and asserts that each route
 * answers. It is the cheapest thing that would have caught all of them, and
 * the check to run before shipping a change that touches shared plumbing.
 *
 * Sessions are minted straight into the database rather than typed into the
 * login form, because signing in is a server action and this script is not a
 * browser. That is also what lets it check the analyst and reader views,
 * which is where most of these pages live and where nobody looks before
 * deploying.
 *
 * Usage (app built, database seeded, DATABASE_URL pointing at it):
 *   npm run verify:pages                  # boots `next start` itself
 *   npm run verify:pages -- http://host   # against something already running
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
// The real ones, not a copy: a script that reimplements session hashing
// passes while the app rejects every cookie it mints, which is exactly what
// happened the first time this was written.
import { generateToken, hashToken } from '../src/lib/auth/tokens';

const explicitBase = process.argv[2];
const port = Number(process.env.SMOKE_PORT ?? 3100);
const base = explicitBase ?? `http://127.0.0.1:${port}`;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

/*
 * Duplicated from src/lib/auth/session.ts, which cannot be imported here: it
 * pulls in next/headers. The hashing beside it is imported, not copied.
 */
const SESSION_COOKIE = 'dajda_session';

type Who = 'anon' | 'reader' | 'analyst';

type Route = { path: string; as: Who };

/**
 * A page that renders for an anonymous visitor and fails for a signed-in one
 * is a real and easy mistake, so the shared pages are listed under both.
 */
const ROUTES: Route[] = [
  { path: '/', as: 'anon' },
  { path: '/free', as: 'anon' },
  { path: '/paid', as: 'anon' },
  { path: '/pricing', as: 'anon' },
  { path: '/how-it-works', as: 'anon' },
  { path: '/legal', as: 'anon' },
  { path: '/contact', as: 'anon' },
  { path: '/login', as: 'anon' },
  { path: '/register', as: 'anon' },
  { path: '/forgot-password', as: 'anon' },
  { path: '/api/health', as: 'anon' },
  { path: '/robots.txt', as: 'anon' },
  { path: '/sitemap.xml', as: 'anon' },

  { path: '/', as: 'reader' },
  { path: '/free', as: 'reader' },
  { path: '/paid', as: 'reader' },
  { path: '/pricing', as: 'reader' },
  { path: '/dashboard', as: 'reader' },
  { path: '/dashboard/settings', as: 'reader' },
  { path: '/apply', as: 'reader' },

  { path: '/', as: 'analyst' },
  { path: '/analyst', as: 'analyst' },
  { path: '/analyst/earnings', as: 'analyst' },
  { path: '/dashboard', as: 'analyst' },
  { path: '/dashboard/settings', as: 'analyst' },
];

async function sessionCookieFor(where: { analyst: boolean }): Promise<string> {
  const user = where.analyst
    ? await prisma.user.findFirst({
        where: { analystProfile: { status: 'APPROVED' } },
        select: { id: true, email: true },
      })
    : await prisma.user.findFirst({
        where: { role: 'USER', analystProfile: null, status: 'ACTIVE' },
        select: { id: true, email: true },
      });

  if (!user) {
    throw new Error(
      `no ${where.analyst ? 'approved analyst' : 'reader'} in the database. Seed it first: npm run db:seed:demo`,
    );
  }

  const token = generateToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: 'verify-pages',
    },
  });

  return `${SESSION_COOKIE}=${token}`;
}

/**
 * Routes taken from the database rather than hard-coded, so a detail page is
 * checked with an id that actually exists and the list cannot go stale.
 */
async function discoveredRoutes(): Promise<Route[]> {
  const routes: Route[] = [];

  const analyst = await prisma.analystProfile.findFirst({
    where: { status: 'APPROVED' },
    select: { slug: true },
  });
  if (analyst) {
    routes.push(
      { path: `/analysts/${analyst.slug}`, as: 'anon' },
      { path: `/analysts/${analyst.slug}`, as: 'reader' },
      // The author's own view of their page carries controls nobody else
      // gets, which is exactly the branch that breaks unnoticed.
      { path: `/analysts/${analyst.slug}`, as: 'analyst' },
    );
  }

  const free = await prisma.prediction.findFirst({
    where: { visibility: 'PUBLIC', publishedAt: { not: null } },
    select: { id: true },
  });
  if (free) {
    routes.push(
      { path: `/free/${free.id}`, as: 'anon' },
      { path: `/free/${free.id}`, as: 'reader' },
    );
  }

  const paid = await prisma.prediction.findFirst({
    where: { visibility: { not: 'PUBLIC' }, publishedAt: { not: null } },
    select: { id: true },
  });
  // A locked ticket must render its gate, not an error.
  if (paid) routes.push({ path: `/free/${paid.id}`, as: 'reader' });

  return routes;
}

async function waitForServer(attempts = 120): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    const up = await fetch(base, { redirect: 'manual' })
      .then(() => true)
      .catch(() => false);
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not come up at ${base}`);
}

async function main(): Promise<void> {
  /*
   * Everything the database is needed for happens BEFORE the server starts,
   * and the connection is released before it does. The development database
   * (scripts/dev-db.mjs) is a single-connection PGlite server, so a script
   * holding a connection while the app wants one deadlocks the run; this way
   * exactly one process is connected at any moment, which is also correct
   * against a real Postgres and costs nothing there.
   */
  const cookies: Record<Who, string | null> = {
    anon: null,
    reader: await sessionCookieFor({ analyst: false }),
    analyst: await sessionCookieFor({ analyst: true }),
  };
  const routes = [...ROUTES, ...(await discoveredRoutes())];
  await prisma.$disconnect();

  const server = explicitBase
    ? null
    : spawn('npx', ['next', 'start', '-p', String(port)], {
        stdio: ['ignore', 'ignore', 'inherit'],
        /*
         * The development database is a single-connection PGlite server, and
         * one page render issues several queries at once. DATABASE_POOL_MAX
         * exists for exactly this: the queries queue on one connection
         * instead of opening four and having three dropped. Harmless against
         * a real Postgres, which is why it is not conditional.
         */
        env: { ...process.env, DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? '1' },
      });

  const failures: { route: Route; status: number }[] = [];

  try {
    await waitForServer();

    for (const route of routes) {
      const cookie = cookies[route.as];
      const headers: Record<string, string> = cookie ? { cookie } : {};

      /*
       * Two retries, and only on a server error. The development database
       * (PGlite over a socket) drops a connection now and then under a burst
       * of page renders, and a smoke test that cries wolf gets ignored, which
       * is worse than not having one. A page that is actually broken fails
       * both times.
       */
      let response = await fetch(`${base}${route.path}`, {
        redirect: 'manual',
        headers,
      });
      for (let attempt = 0; attempt < 2 && response.status >= 500; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        response = await fetch(`${base}${route.path}`, {
          redirect: 'manual',
          headers,
        });
      }

      /*
       * Under 400 is a rendered page or a deliberate redirect. The exception
       * is a signed-in request bounced to /login: that is the session not
       * being honoured, which is a broken page wearing a 307, and counting
       * it as a pass is how an authentication regression ships.
       */
      const location = response.headers.get('location') ?? '';
      const bouncedToLogin =
        route.as !== 'anon' && location.includes('/login');
      const ok = response.status < 400 && !bouncedToLogin;
      if (!ok) failures.push({ route, status: response.status });

      console.info(
        `${ok ? 'ok  ' : 'FAIL'} ${String(response.status).padEnd(3)} ${route.as.padEnd(7)} ${route.path}`,
      );
    }
  } finally {
    server?.kill('SIGKILL');

    // Tidying up, not a result. These sessions expire within the hour on
    // their own, so a database that hiccups while being cleaned must not
    // turn a green run red.
    try {
      await prisma.session.deleteMany({ where: { userAgent: 'verify-pages' } });
    } catch {
      console.warn('could not delete the temporary sessions; they expire in an hour');
    }
    await prisma.$disconnect().catch(() => {});
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} route(s) failed:`);
    for (const { route, status } of failures) {
      console.error(`  ${status}  ${route.as}  ${route.path}`);
    }
    process.exit(1);
  }

  console.info(`\nall ${routes.length} route checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
