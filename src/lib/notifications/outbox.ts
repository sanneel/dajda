import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * The notification outbox.
 *
 * Nothing in this file sends anything, and that is deliberate rather than
 * unfinished. Delivery needs an SMTP account and a Telegram bot token that do
 * not exist yet; what CAN be settled now is who should be told, on which
 * channel, at which address, and about what. Writing that down as durable rows
 * means switching a sender on later is a background job that reads PENDING
 * rows, not a change to any of the code that decides what is worth sending.
 *
 * Two things are resolved at enqueue time on purpose:
 *
 *   1. The destination address. If someone changes their email tomorrow, a
 *      message queued today must not silently redirect.
 *   2. The subject and body text. A message describes the world at the moment
 *      it was triggered; rendering it at send time would let a later edit
 *      rewrite history.
 */

export type NotifiableEvent = {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
  postId?: string;
  predictionId?: string;
};

/** Which preference flag governs a given event. */
export type NotificationTopic = 'LIVE_SESSION' | 'NEW_BET' | 'SETTLEMENT';

type Recipient = {
  userId: string;
  email: string;
  telegramUsername: string | null;
  prefs: {
    emailOnNewPrediction: boolean;
    emailOnSettlement: boolean;
    emailOnLiveSession: boolean;
    telegramEnabled: boolean;
    telegramUsername: string | null;
  } | null;
};

/**
 * Everyone entitled to hear from this analyst: active subscribers plus anyone
 * who saved them.
 *
 * Saved-but-not-subscribed readers are included because saving is an explicit
 * "tell me about this person" action. A reader who has done neither is never
 * contacted, so this can never become a broadcast list.
 */
async function audienceFor(analystProfileId: string): Promise<Recipient[]> {
  const select = {
    id: true,
    email: true,
    telegramUsername: true,
    notificationPrefs: {
      select: {
        emailOnNewPrediction: true,
        emailOnSettlement: true,
        emailOnLiveSession: true,
        telegramEnabled: true,
        telegramUsername: true,
      },
    },
  } satisfies Prisma.UserSelect;

  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        {
          subscriptions: {
            some: {
              status: 'ACTIVE',
              OR: [
                { currentPeriodEnd: null },
                { currentPeriodEnd: { gt: new Date() } },
              ],
              plan: { analystProfileId },
            },
          },
        },
        { savedAnalysts: { some: { analystProfileId } } },
      ],
    },
    select,
  });

  return users.map((user) => ({
    userId: user.id,
    email: user.email,
    telegramUsername: user.telegramUsername,
    prefs: user.notificationPrefs,
  }));
}

function wantsEmail(recipient: Recipient, topic: NotificationTopic): boolean {
  // No preference row yet means the defaults apply, and the defaults opt in.
  if (!recipient.prefs) return true;
  if (topic === 'LIVE_SESSION') return recipient.prefs.emailOnLiveSession;
  if (topic === 'NEW_BET') return recipient.prefs.emailOnNewPrediction;
  return recipient.prefs.emailOnSettlement;
}

/**
 * Write one row per person per enabled channel.
 *
 * A recipient who has switched Telegram on but never supplied a handle gets a
 * SKIPPED row rather than nothing at all: "we had no address for them" is a
 * fact worth being able to see, and it is not the same as a delivery failure.
 */
export async function enqueueForAnalystAudience(
  analystProfileId: string,
  topic: NotificationTopic,
  event: NotifiableEvent,
): Promise<{ queued: number; skipped: number }> {
  const recipients = await audienceFor(analystProfileId);
  if (recipients.length === 0) return { queued: 0, skipped: 0 };

  const rows: Prisma.NotificationCreateManyInput[] = [];

  for (const recipient of recipients) {
    if (wantsEmail(recipient, topic)) {
      rows.push({
        userId: recipient.userId,
        channel: 'EMAIL',
        status: 'PENDING',
        destination: recipient.email,
        subjectKa: event.subjectKa,
        bodyKa: event.bodyKa,
        linkPath: event.linkPath,
        postId: event.postId ?? null,
        predictionId: event.predictionId ?? null,
      });
    }

    if (recipient.prefs?.telegramEnabled) {
      const handle =
        recipient.prefs.telegramUsername ?? recipient.telegramUsername;
      rows.push({
        userId: recipient.userId,
        channel: 'TELEGRAM',
        status: handle ? 'PENDING' : 'SKIPPED',
        destination: handle,
        subjectKa: event.subjectKa,
        bodyKa: event.bodyKa,
        linkPath: event.linkPath,
        postId: event.postId ?? null,
        predictionId: event.predictionId ?? null,
        failureReason: handle ? null : 'ტელეგრამის მომხმარებელი მითითებული არაა.',
      });
    }
  }

  if (rows.length === 0) return { queued: 0, skipped: 0 };

  await prisma.notification.createMany({ data: rows });

  return {
    queued: rows.filter((row) => row.status === 'PENDING').length,
    skipped: rows.filter((row) => row.status === 'SKIPPED').length,
  };
}
