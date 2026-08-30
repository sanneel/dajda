/**
 * Grants ADMIN to a user by email.
 *
 * The admin role is the only thing that can approve an analyst application or
 * settle a bet, and the seeded admin account is a separate login nobody wants
 * to juggle. This promotes an EXISTING account - the owner's own Google or
 * email login - so they administer the site as themselves.
 *
 *   ADMIN_EMAIL=you@example.com npx tsx scripts/grant-admin.ts
 *
 * Idempotent: an account already ADMIN is left as-is. Never creates an account
 * (there is no password to invent) - the person must have signed in at least
 * once so the row exists. Non-fatal on every expected miss, so it is safe to
 * wire into a one-off build step the way the paid-ticket top-up was.
 */
import 'dotenv/config';
import process from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
if (!email) {
  console.info('ADMIN_EMAIL not set; nothing to do.');
  process.exit(0);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, keepAlive: true }),
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.info(
      `No account for ${email} yet. Sign in once (Google or email), then rerun.`,
    );
    return;
  }

  if (user.role === 'ADMIN') {
    console.info(`${user.email} is already ADMIN.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
  });
  console.info(`${user.email}: ${user.role} -> ADMIN.`);
}

main()
  .catch((error) => {
    // Non-fatal: this may run inside a build, and failing to promote an admin
    // must not block a deploy.
    console.error('grant-admin failed (non-fatal):', error);
  })
  .finally(() => prisma.$disconnect());
