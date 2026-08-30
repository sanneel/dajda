/**
 * Ensures a dedicated email+password ADMIN account exists.
 *
 * Separate from grant-admin.ts, which promotes an existing person's own
 * login: this MINTS a standalone admin sign-in (no Google, no personal
 * inbox) that the owner can hand to whoever settles bets and reviews analyst
 * applications. Idempotent - it upserts by email, so a second run only
 * refreshes the password and re-asserts the role.
 *
 *   ADMIN_EMAIL=admin@dajda.ge ADMIN_PW='…' ADMIN_NAME='ადმინი' \
 *     npx tsx scripts/ensure-admin-account.ts
 *
 * The password is taken from the environment and never printed, so it does
 * not end up in a build log. Non-fatal on error so it is safe inside a
 * one-off build step.
 */
import 'dotenv/config';
import process from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/auth/password';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const pw = process.env.ADMIN_PW ?? '';
const name = process.env.ADMIN_NAME ?? 'ადმინისტრატორი';

if (!email || pw.length < 10) {
  console.info('ADMIN_EMAIL and a 10+ char ADMIN_PW are required; skipping.');
  process.exit(0);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, keepAlive: true }),
});

async function main() {
  const password = await hashPassword(pw);
  const now = new Date();

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password,
        role: 'ADMIN',
        emailVerifiedAt: now,
        ageConfirmedAt: now,
      },
    });
    console.info(`Admin account refreshed: ${email} (password reset, role ADMIN).`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      password,
      role: 'ADMIN',
      emailVerifiedAt: now,
      ageConfirmedAt: now,
      isDemo: false,
      notificationPrefs: { create: {} },
    },
  });
  console.info(`Admin account created: ${email}.`);
}

main()
  .catch((error) => {
    console.error('ensure-admin-account failed (non-fatal):', error);
  })
  .finally(() => prisma.$disconnect());
