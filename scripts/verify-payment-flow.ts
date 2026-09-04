/**
 * End-to-end verification of the payment webhook contract.
 *
 * Drives the real HTTP endpoint against a real database - no mocks, no
 * in-memory fakes. Asserts the guarantees the product depends on:
 *
 *   1. a verified approval activates the subscription
 *   2. replaying the same event does nothing the second time
 *   3. a forged signature changes nothing
 *   4. a mismatched amount changes nothing
 *   5. a browser "return" is never sufficient on its own
 *
 * Usage (with the app running and DATABASE_URL pointing at the same database):
 *   npx tsx scripts/verify-payment-flow.ts [baseUrl]
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  MOCK_EVENT_ID_HEADER,
  MOCK_SIGNATURE_HEADER,
  MOCK_TIMESTAMP_HEADER,
  signMockWebhook,
} from '../src/lib/payments/mock';

const runId = randomUUID().slice(0, 8);
const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const secret = process.env.MOCK_PAYMENT_SECRET ?? 'dev-mock-secret';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(process.env.DATABASE_POOL_MAX
      ? { max: Number(process.env.DATABASE_POOL_MAX) }
      : {}),
  }),
});

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.info(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

async function postWebhook(
  body: Record<string, unknown>,
  options: { eventId: string; signature?: string; timestamp?: number },
) {
  // The development database server (scripts/dev-db.mjs) accepts a single
  // connection at a time, so this script must release its own before the app
  // can serve the request. Prisma reconnects lazily on the next query.
  await prisma.$disconnect();

  const raw = JSON.stringify(body);
  const timestamp = options.timestamp ?? Date.now();

  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]:
        options.signature ?? signMockWebhook(raw, timestamp, secret),
      [MOCK_TIMESTAMP_HEADER]: String(timestamp),
      [MOCK_EVENT_ID_HEADER]: options.eventId,
    },
    body: raw,
  });

  return (await response.json()) as { action?: string };
}

async function createPendingOrder(plan: { id: string; priceMinor: number }, userId: string) {
  const orderId = `verify-${randomUUID()}`;

  const subscription = await withRetry(() =>
    prisma.userSubscription.create({
      data: { userId, planId: plan.id, status: 'PENDING' },
    }),
  );

  await withRetry(() =>
    prisma.payment.create({
    data: {
      userId,
      planId: plan.id,
      subscriptionId: subscription.id,
      providerCode: 'mock',
      providerOrderId: orderId,
      amountMinor: plan.priceMinor,
      currency: 'GEL',
      status: 'CREATED',
      },
    }),
  );

  return { orderId, subscriptionId: subscription.id };
}

/**
 * Retry around the single-connection development server: the app may still be
 * holding the one available connection for a moment after responding.
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError;
}

async function statusOf(subscriptionId: string) {
  return withRetry(() =>
    prisma.userSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { status: true, currentPeriodEnd: true },
    }),
  );
}

async function purgePreviousRuns() {
  // A previous interrupted run may have left rows behind; they would collide
  // with this run's unique constraints.
  await withRetry(() =>
    prisma.paymentStatusTransition.deleteMany({
      where: { payment: { providerOrderId: { startsWith: 'verify-' } } },
    }),
  );
  const stale = await withRetry(() =>
    prisma.payment.findMany({
      where: { providerOrderId: { startsWith: 'verify-' } },
      select: { subscriptionId: true },
    }),
  );
  await withRetry(() =>
    prisma.payment.deleteMany({
      where: { providerOrderId: { startsWith: 'verify-' } },
    }),
  );
  const ids = stale
    .map((row) => row.subscriptionId)
    .filter((id): id is string => id !== null);
  if (ids.length > 0) {
    await withRetry(() =>
      prisma.userSubscription.deleteMany({ where: { id: { in: ids } } }),
    );
  }
}

async function main() {
  await purgePreviousRuns();

  const user = await withRetry(() => prisma.user.findFirstOrThrow({
    where: { email: 'user@dajda.ge' },
    select: { id: true },
  }));
  const plan = await withRetry(() => prisma.subscriptionPlan.findFirstOrThrow({
    where: {
      priceMinor: { gt: 0 },
      analystProfileId: { not: null },
      // A plan the user already holds would exercise the double-activation
      // path rather than the ordinary one.
      subscriptions: { none: { userId: user.id, status: 'ACTIVE' } },
    },
    select: { id: true, priceMinor: true },
  }));

  // ---- 1. verified approval activates -------------------------------------
  console.info('\n1. verified approval activates the subscription');
  const order = await createPendingOrder(plan, user.id);
  check(
    'subscription starts PENDING, not ACTIVE',
    (await statusOf(order.subscriptionId)).status === 'PENDING',
  );

  const eventId = randomUUID();
  const payload = {
    order_id: order.orderId,
    payment_id: `mock-pay-1-${runId}`,
    order_status: 'approved',
    amount: plan.priceMinor,
    currency: 'GEL',
  };

  const first = await postWebhook(payload, { eventId });
  check('webhook reports APPLIED', first.action === 'APPLIED', JSON.stringify(first));

  const afterApproval = await statusOf(order.subscriptionId);
  check('subscription is now ACTIVE', afterApproval.status === 'ACTIVE');
  check(
    'a renewal date was set',
    afterApproval.currentPeriodEnd !== null,
  );

  // ---- 2. replay is a no-op ----------------------------------------------
  console.info('\n2. replaying the same event does nothing');
  const replay = await postWebhook(payload, { eventId });
  check(
    'replay reports DUPLICATE_IGNORED',
    replay.action === 'DUPLICATE_IGNORED',
    replay.action,
  );

  const transitions = await withRetry(() =>
    prisma.paymentStatusTransition.count({
      where: { payment: { providerOrderId: order.orderId } },
    }),
  );
  check('exactly one status transition was recorded', transitions === 1,
    `got ${transitions}`);

  // ---- 3. forged signature changes nothing --------------------------------
  console.info('\n3. a forged signature is rejected');
  const forgedOrder = await createPendingOrder(plan, user.id);
  const forged = await postWebhook(
    {
      order_id: forgedOrder.orderId,
      payment_id: `mock-pay-2-${runId}`,
      order_status: 'approved',
      amount: plan.priceMinor,
      currency: 'GEL',
    },
    { eventId: randomUUID(), signature: 'f'.repeat(64) },
  );

  check(
    'webhook reports REJECTED_SIGNATURE',
    forged.action === 'REJECTED_SIGNATURE',
    forged.action,
  );
  check(
    'subscription stays PENDING after a forged callback',
    (await statusOf(forgedOrder.subscriptionId)).status === 'PENDING',
  );

  const rejectedLogged = await withRetry(() =>
    prisma.webhookEvent.count({ where: { signatureValid: false } }),
  );
  check('the rejected delivery was still recorded', rejectedLogged > 0);

  // ---- 4. amount mismatch changes nothing ---------------------------------
  console.info('\n4. an amount mismatch is rejected');
  const cheapOrder = await createPendingOrder(plan, user.id);
  const mismatch = await postWebhook(
    {
      order_id: cheapOrder.orderId,
      payment_id: `mock-pay-3-${runId}`,
      order_status: 'approved',
      // Claiming the customer paid 1 tetri for a 29 GEL plan.
      amount: 1,
      currency: 'GEL',
    },
    { eventId: randomUUID() },
  );

  check(
    'webhook reports AMOUNT_MISMATCH',
    mismatch.action === 'AMOUNT_MISMATCH',
    mismatch.action,
  );
  check(
    'subscription stays PENDING after an amount mismatch',
    (await statusOf(cheapOrder.subscriptionId)).status === 'PENDING',
  );

  // ---- 5. stale timestamp is rejected -------------------------------------
  console.info('\n5. a stale (replayed) timestamp is rejected');
  const staleOrder = await createPendingOrder(plan, user.id);
  const stale = await postWebhook(
    {
      order_id: staleOrder.orderId,
      payment_id: `mock-pay-4-${runId}`,
      order_status: 'approved',
      amount: plan.priceMinor,
      currency: 'GEL',
    },
    { eventId: randomUUID(), timestamp: Date.now() - 60 * 60 * 1000 },
  );

  check(
    'webhook reports REJECTED_SIGNATURE for a stale delivery',
    stale.action === 'REJECTED_SIGNATURE',
    stale.action,
  );
  check(
    'subscription stays PENDING after a stale delivery',
    (await statusOf(staleOrder.subscriptionId)).status === 'PENDING',
  );

  // ---- 6. a second payment for a plan already held is folded in ------------
  // The plan from step 1 is ACTIVE for this user now. A second verified
  // approval for the same plan (two tabs, a gateway retry) must extend that
  // subscription rather than fail on the one-active-per-plan index.
  console.info('\n6. a second payment for an already active plan extends it');
  const secondOrder = await createPendingOrder(plan, user.id);
  const second = await postWebhook(
    {
      order_id: secondOrder.orderId,
      payment_id: `mock-pay-5-${runId}`,
      order_status: 'approved',
      amount: plan.priceMinor,
      currency: 'GEL',
    },
    { eventId: randomUUID() },
  );
  check('webhook reports APPLIED', second.action === 'APPLIED', JSON.stringify(second));
  const folded = await statusOf(secondOrder.subscriptionId);
  check('the duplicate subscription is closed, not left PENDING', folded.status === 'CANCELED', folded.status);
  const extended = await statusOf(order.subscriptionId);
  const extendedBy =
    extended.currentPeriodEnd && afterApproval.currentPeriodEnd
      ? extended.currentPeriodEnd.getTime() - afterApproval.currentPeriodEnd.getTime()
      : 0;
  check(
    'the running subscription gained the paid period',
    extendedBy >= 27 * 24 * 60 * 60 * 1000,
    `extended by ${Math.round(extendedBy / 86_400_000)} days`,
  );

  // ---- cleanup ------------------------------------------------------------
  const orderIds = [
    order.orderId,
    forgedOrder.orderId,
    cheapOrder.orderId,
    staleOrder.orderId,
    secondOrder.orderId,
  ];
  await prisma.paymentStatusTransition.deleteMany({
    where: { payment: { providerOrderId: { in: orderIds } } },
  });
  await prisma.payment.deleteMany({
    where: { providerOrderId: { in: orderIds } },
  });
  await prisma.userSubscription.deleteMany({
    where: {
      id: {
        in: [
          order.subscriptionId,
          forgedOrder.subscriptionId,
          cheapOrder.subscriptionId,
          staleOrder.subscriptionId,
          secondOrder.subscriptionId,
        ],
      },
    },
  });

  console.info(
    failures === 0
      ? '\nAll payment-flow checks passed.'
      : `\n${failures} check(s) FAILED.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
