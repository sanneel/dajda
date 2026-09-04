/**
 * One-off: bring rows written before the card token was sealed up to the
 * current rule.
 *
 *   - UserSubscription.cardToken stored in the clear is sealed in place
 *     (same envelope, same key as new writes), so it keeps working.
 *   - WebhookEvent.payload rows that still carry a plaintext `rectoken`
 *     get it replaced with "[redacted]", as new deliveries are stored.
 *
 *   npx tsx scripts/seal-card-tokens.ts            dry run: counts only
 *   npx tsx scripts/seal-card-tokens.ts --yes      rewrite
 *
 * Idempotent: a sealed token opens under the key and is left alone; a
 * payload without a plaintext rectoken is skipped.
 */
import 'dotenv/config';
import process from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Prisma } from '../src/generated/prisma/client';
import { cardTokenKey, openCardToken, sealCardToken } from '../src/lib/payments/card-token';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const execute = process.argv.includes('--yes');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, keepAlive: true, max: 1 }),
});

/**
 * The sealing key comes from the app's own environment (PAYOUT_CARD_KEY or
 * AUTH_SECRET). Run with only a DATABASE_URL, as against a remote database
 * whose secrets are not on this machine, there is no key to seal under:
 * plaintext tokens are then dropped rather than re-encrypted. A dropped
 * token costs nothing the gateway's own renewal calendar does not cover.
 */
function sealingKey(): Buffer | null {
  try {
    return cardTokenKey();
  } catch {
    return null;
  }
}

async function main() {
  const key = sealingKey();
  console.info(
    key
      ? 'Sealing key available: plaintext tokens will be sealed in place.'
      : 'No sealing key in this environment: plaintext tokens will be dropped.',
  );

  const withToken = await prisma.userSubscription.findMany({
    where: { cardToken: { not: null } },
    select: { id: true, cardToken: true },
  });
  const plaintext = withToken.filter(
    (row) => row.cardToken && (key === null || openCardToken(row.cardToken, key) === null),
  );

  const events = await prisma.webhookEvent.findMany({
    where: { payload: { path: ['rectoken'], not: '[redacted]' } },
    select: { id: true, payload: true },
  });
  const leaking = events.filter((row) => {
    const payload = row.payload as Record<string, unknown> | null;
    const token = payload?.rectoken;
    return typeof token === 'string' && token !== '' && token !== '[redacted]';
  });

  console.info(execute ? 'Rewriting:' : 'Dry run. Would rewrite:');
  console.info(`  subscriptions with a plaintext card token: ${plaintext.length} of ${withToken.length} with a token`);
  console.info(`  webhook events with a plaintext rectoken:  ${leaking.length}`);

  if (!execute) {
    if (plaintext.length + leaking.length > 0) console.info('\nRun again with --yes to rewrite.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of plaintext) {
      await tx.userSubscription.update({
        where: { id: row.id },
        data: {
          cardToken: key ? sealCardToken(row.cardToken as string, key) : null,
          ...(key ? {} : { cardTokenLifetime: null }),
        },
      });
    }
    for (const row of leaking) {
      const payload = { ...(row.payload as Record<string, unknown>), rectoken: '[redacted]' };
      await tx.webhookEvent.update({
        where: { id: row.id },
        data: { payload: payload as Prisma.InputJsonValue },
      });
    }
  });

  console.info('\nDone.');
}

main()
  .catch((error) => {
    console.error('seal-card-tokens failed; nothing was rewritten:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
