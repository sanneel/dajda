/**
 * Remove every invented row from a database before real people use it.
 *
 * `npm run db:seed:demo` plants demo analysts, their bets, a demo
 * subscriber, demo plans and demo posts, all flagged `isDemo`. They belong
 * on a laptop. On a public deployment they sit in the admin's settlement
 * queue next to real work and on the public leaderboard next to real
 * authors, and the product's whole claim is that the published record is
 * real. This removes them and nothing else.
 *
 *   npm run demo:purge            dry run: counts what would go
 *   npm run demo:purge -- --yes   actually delete, in one transaction
 *
 * What goes: demo users, demo analyst profiles (and everything that hangs
 * off them: plans, posts, broadcasts, saved-by rows), every prediction by a
 * demo author or demo poster, subscriptions to demo plans (including a REAL
 * account's test subscription to a demo author - it has nothing to point at
 * once the plan is gone), the demo users' money rows, and the slip images
 * only those predictions referenced.
 *
 * What stays: every real user, their payments (a payment that pointed at a
 * demo plan or ticket keeps its amount and loses the pointer), the audit
 * log, the webhook ledger. Nothing here is a reset.
 *
 * The order below is the foreign-key order: rows a demo user is restricted
 * by (money, payouts, predictions) first, then the profiles, then the users.
 * One transaction, so a constraint nobody foresaw leaves the database as it
 * was rather than half-purged.
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

const execute = process.argv.includes('--yes');

// One connection, queries in sequence: the local development database
// (scripts/dev-db.mjs) serves exactly one client, and a real Postgres loses
// nothing by being asked politely.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, keepAlive: true, max: 1 }),
});

async function main() {
  const demoUsers = await prisma.user.findMany({
    where: { isDemo: true },
    select: { id: true, email: true },
  });
  const demoProfiles = await prisma.analystProfile.findMany({
    where: { isDemo: true },
    select: { id: true, slug: true },
  });
  const demoPlans = await prisma.subscriptionPlan.findMany({
    where: { isDemo: true },
    select: { id: true },
  });

  const userIds = demoUsers.map((user) => user.id);
  const profileIds = demoProfiles.map((profile) => profile.id);
  const planIds = demoPlans.map((plan) => plan.id);

  const predictionWhere = {
    OR: [
      { isDemo: true },
      { authorId: { in: profileIds } },
      { postedById: { in: userIds } },
    ],
  };
  const subscriptionWhere = {
    OR: [{ planId: { in: planIds } }, { userId: { in: userIds } }],
  };
  const postWhere = {
    OR: [{ isDemo: true }, { authorId: { in: profileIds } }],
  };
  const planWhere = {
    OR: [{ isDemo: true }, { analystProfileId: { in: profileIds } }],
  };

  const predictions = await prisma.prediction.count({ where: predictionWhere });
  const subscriptions = await prisma.userSubscription.count({
    where: subscriptionWhere,
  });
  const posts = await prisma.analystPost.count({ where: postWhere });
  const payments = await prisma.payment.count({
    where: { userId: { in: userIds } },
  });
  const balanceRows = await prisma.balanceTransaction.count({
    where: { userId: { in: userIds } },
  });
  const payouts = await prisma.analystPayout.count({
    where: { userId: { in: userIds } },
  });

  console.info(execute ? 'Purging demo data:' : 'Dry run. Would remove:');
  console.info(`  users:          ${demoUsers.length}  ${demoUsers.map((u) => u.email).join(', ')}`);
  console.info(`  profiles:       ${demoProfiles.length}  ${demoProfiles.map((p) => p.slug).join(', ')}`);
  console.info(`  plans:          ${planIds.length}`);
  console.info(`  predictions:    ${predictions}`);
  console.info(`  subscriptions:  ${subscriptions}`);
  console.info(`  posts:          ${posts}`);
  console.info(`  payments:       ${payments}  (demo users' own)`);
  console.info(`  balance rows:   ${balanceRows}`);
  console.info(`  payouts:        ${payouts}`);

  if (
    demoUsers.length === 0 &&
    demoProfiles.length === 0 &&
    planIds.length === 0 &&
    predictions === 0
  ) {
    console.info('Nothing flagged as demo. Nothing to do.');
    return;
  }

  if (!execute) {
    console.info('\nRun again with --yes to delete.');
    return;
  }

  // The slips those predictions referenced, so the image rows go too.
  const slips = await prisma.prediction.findMany({
    where: predictionWhere,
    select: {
      screenshotPath: true,
      resultScreenshotPath: true,
      extraScreenshotPaths: true,
    },
  });
  const screenshotNames = slips
    .flatMap((row) => [
      row.screenshotPath,
      row.resultScreenshotPath,
      ...row.extraScreenshotPaths,
    ])
    .filter((path): path is string => Boolean(path))
    .map((path) => path.replace(/^\/uploads\//, ''));

  await prisma.$transaction(
    async (tx) => {
      // Rows that RESTRICT deleting a demo user, first.
      await tx.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
      await tx.analystPayout.deleteMany({ where: { userId: { in: userIds } } });
      await tx.payment.deleteMany({ where: { userId: { in: userIds } } });
      await tx.prediction.deleteMany({ where: predictionWhere });

      // Subscriptions RESTRICT deleting their plan.
      await tx.userSubscription.deleteMany({ where: subscriptionWhere });
      await tx.analystPost.deleteMany({ where: postWhere });
      await tx.subscriptionPlan.deleteMany({ where: planWhere });

      await tx.analystProfile.deleteMany({ where: { id: { in: profileIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });

      if (screenshotNames.length > 0) {
        await tx.screenshot.deleteMany({
          where: { name: { in: screenshotNames } },
        });
      }
    },
    { timeout: 120_000 },
  );

  console.info(`\nDone. ${screenshotNames.length} slip image(s) removed with them.`);
}

main()
  .catch((error) => {
    console.error('purge-demo failed; nothing was deleted:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
