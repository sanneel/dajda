import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';

/**
 * A live cancellation test: two calendars, one card, one of them stopped.
 *
 * The cancel path calls the gateway's stop before it touches our database and
 * fails the whole cancellation on a refusal, so the code is not in doubt. What
 * is in doubt is whether the gateway honours it - a calendar still charging
 * after an accepted stop looks, from here, exactly like one that was never
 * opened. Only a card settles that, and only by comparison: two identical
 * calendars, one stopped and one not, and then look at which was charged.
 *
 * Everything here is deliberately outside the product's subscription flow. It
 * talks to the provider directly, so it neither needs nor grants renewals on
 * the site, writes no UserSubscription, and is unaffected by whether the
 * published terms describe renewals yet. The orders carry their own prefix so
 * nothing downstream mistakes them for a customer's.
 *
 * Three things bound the risk: a tenth of a lari a charge, at most three
 * renewals per calendar even if every stop fails, and admin-only access.
 */

/** 0.10 GEL, the amount Flitt asked for on a live card. */
export const LIVE_TEST_AMOUNT_MINOR = 10;

/**
 * The calendar ends by itself after this many renewals. The product's bound
 * is nominal because a subscription runs until canceled; here it is the only
 * thing that stops the card if the cancellation under test does not work.
 */
export const LIVE_TEST_MAX_RENEWALS = 3;

/** Marks an order as this test's, never a customer's. */
export const LIVE_TEST_ORDER_PREFIX = 'canceltest';

export type TestCalendar = { role: 'a' | 'b'; orderId: string; url: string };

export type CancellationTest = {
  startedAt: Date;
  /** When the first renewal falls due, as sent to the gateway. */
  firstChargeAt: string;
  amountMinor: number;
  maxRenewals: number;
  calendars: TestCalendar[];
};

/**
 * The gateway's shortest cycle is a day, but the first charge can be put an
 * hour out, and that first charge is what answers the question. Written in the
 * merchant's own timezone, because a bare date would mean midnight and cost a
 * day.
 */
function firstChargeStamp(inMinutes: number): string {
  const due = new Date(Date.now() + inMinutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(due);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export async function openCancellationTest(
  actor: { userId: string },
  options: { firstChargeInMinutes: number },
): Promise<CancellationTest> {
  const minutes = options.firstChargeInMinutes;
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'პირველი ჩამოჭრა 15 წუთიდან 24 საათამდე შუალედში უნდა იყოს.',
    );
  }

  const provider = getPaymentProvider();
  const env = getEnv();
  const firstChargeAt = firstChargeStamp(minutes);

  const calendars: TestCalendar[] = [];
  for (const role of ['a', 'b'] as const) {
    const orderId = `${LIVE_TEST_ORDER_PREFIX}-${role}-${randomUUID().slice(0, 8)}`;
    const session = await provider.createCheckoutSession({
      orderId,
      amountMinor: LIVE_TEST_AMOUNT_MINOR,
      currency: 'GEL',
      description: `DAJDA: გამოწერის ტესტი ${role.toUpperCase()}`,
      returnUrl: `${env.APP_URL}/admin/payments/subscription-test`,
      callbackUrl: `${env.APP_URL}/api/webhooks/payments/flitt`,
      subscription: {
        every: 1,
        period: 'day',
        startDate: firstChargeAt,
        maxRenewals: LIVE_TEST_MAX_RENEWALS,
      },
      requestCardToken: true,
    });
    calendars.push({ role, orderId, url: session.checkoutUrl });
  }

  const test: CancellationTest = {
    startedAt: new Date(),
    firstChargeAt,
    amountMinor: LIVE_TEST_AMOUNT_MINOR,
    maxRenewals: LIVE_TEST_MAX_RENEWALS,
    calendars,
  };

  await writeAuditLog({
    action: AUDIT_ACTIONS.SUBSCRIPTION_TEST_OPENED,
    entityType: 'PaymentProvider',
    entityId: provider.code,
    summary: `გამოწერის ტესტი: ორი კალენდარი, პირველი ჩამოჭრა ${firstChargeAt}`,
    actorId: actor.userId,
    actorRole: 'ADMIN',
    metadata: {
      firstChargeAt,
      amountMinor: test.amountMinor,
      maxRenewals: test.maxRenewals,
      calendars: calendars.map((calendar) => ({ ...calendar })),
    },
  });

  return test;
}

/**
 * Recent runs, newest first, read out of the audit trail rather than a table
 * of its own: a run is an administrative act, which is what that trail is for.
 *
 * More than one, and not only the latest, for two reasons. Paying happens on
 * the gateway's page in another tab, so the links have to survive coming back.
 * And a second run must not hide the first: those calendars are live on a real
 * card, and a stop button that disappears is a calendar nobody can stop.
 */
export async function recentCancellationTests(
  limit = 5,
): Promise<CancellationTest[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: AUDIT_ACTIONS.SUBSCRIPTION_TEST_OPENED },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { createdAt: true, metadata: true },
  });

  return rows.flatMap((row) => {
    const meta = row.metadata as
      | {
          firstChargeAt?: string;
          amountMinor?: number;
          maxRenewals?: number;
          calendars?: TestCalendar[];
        }
      | null
      | undefined;

    if (!meta?.calendars?.length) return [];

    return [
      {
        startedAt: row.createdAt,
        firstChargeAt: meta.firstChargeAt ?? '',
        amountMinor: meta.amountMinor ?? LIVE_TEST_AMOUNT_MINOR,
        maxRenewals: meta.maxRenewals ?? LIVE_TEST_MAX_RENEWALS,
        calendars: meta.calendars,
      },
    ];
  });
}

/** Stops one of the two calendars, through the call the cancel button makes. */
export async function stopTestCalendar(
  actor: { userId: string },
  orderId: string,
): Promise<{ accepted: boolean; detail: string }> {
  if (!orderId.startsWith(`${LIVE_TEST_ORDER_PREFIX}-`)) {
    // Only this test's own orders. A customer's subscription is canceled
    // through the product, which also settles their access and their record.
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }

  const result = await getPaymentProvider().setSubscriptionState({
    orderId,
    action: 'stop',
  });
  const accepted = result.status === 'ACCEPTED';

  await writeAuditLog({
    action: AUDIT_ACTIONS.SUBSCRIPTION_TEST_STOPPED,
    entityType: 'PaymentProvider',
    entityId: orderId,
    summary: accepted
      ? `ტესტის კალენდარი გაჩერდა: ${orderId}`
      : `ტესტის კალენდარის გაჩერებაზე უარი: ${orderId}`,
    actorId: actor.userId,
    actorRole: 'ADMIN',
    metadata: { orderId, status: result.status, rawStatus: result.rawStatus },
  });

  return {
    accepted,
    detail: result.message ?? result.rawStatus,
  };
}
