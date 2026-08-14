/**
 * Development launcher: brings up the database, then Next.
 *
 * The two used to be separate commands, and `next dev` on its own looks
 * perfectly healthy while every page 500s - the app cannot tell "no database"
 * from any other query failure, so the UI shows its generic error. Starting
 * them together removes that failure mode: if the database cannot be reached,
 * this exits before Next ever boots, and says why.
 *
 * If something is already listening on the port (a previously started dev
 * database, a real Postgres, Docker) it is reused rather than fought over.
 *
 * Deliberately dependency-free - a dev runner is not worth a package.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import process from 'node:process';

const PORT = Number(process.env.DEV_DB_PORT ?? 5432);
const HOST = '127.0.0.1';

/** Resolves true if something accepts a TCP connection on the port. */
function probe(timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port: PORT });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForPort(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probe()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const children = [];
let shuttingDown = false;

function run(command, args, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    // One dying takes the other with it, so a half-running stack is never
    // left behind pretending to work.
    if (shuttingDown) return;
    console.error(`\n[dev] ${label} exited (code ${code}). Shutting down.`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const alreadyUp = await probe();

if (alreadyUp) {
  console.info(`[dev] database already listening on ${HOST}:${PORT} - reusing it`);
} else {
  console.info(`[dev] starting database on ${HOST}:${PORT}`);
  run('node', ['scripts/dev-db.mjs', '--dir', './.pgdata', '--port', String(PORT)], 'database');

  if (!(await waitForPort())) {
    console.error(
      `\n[dev] database never came up on ${HOST}:${PORT}.\n` +
        `      Check the output above, or start it alone with: npm run dev:db\n`,
    );
    shutdown(1);
  }
  console.info('[dev] database ready');
}

run('npx', ['next', 'dev'], 'next');
