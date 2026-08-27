import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * The notification outbox: who should be told, on which channel, at which
 * address, and about what.
 *
 * Nothing in this file sends anything. Telegram rows are drained by
 * `telegram-sender.ts`; email has no sender yet and its rows stay PENDING
 * until one exists. Keeping the decision and the delivery apart is what makes
 * a failed send a retry rather than a lost message, and it means the rules
 * about who gets contacted stay testable without a network.
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
  broadcastId?: string;
};

/**
 * Which preference flag governs a given event.
 *
 * BROADCAST has no flag of its own: it is a message from an analyst the
 * recipient chose to follow or pay for, and it is capped at twice a day by the
 * sender. An unsubscribe exists and is the real one - stop following, or /stop
 * the bot - rather than a checkbox that leaves the relationship in place.
 */
export type NotificationTopic =
  | 'LIVE_SESSION'
  | 'NEW_BET'
  | 'SETTLEMENT'
  | 'BROADCAST';

type Recipient = {
  userId: string;
  email: string;
  telegramChatId: string | null;
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
export async function audienceFor(
  analystProfileId: string,
): Promise<Recipient[]> {
  const select = {
    id: true,
    email: true,
    telegramChatId: true,
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
    telegramChatId: user.telegramChatId,
    prefs: user.notificationPrefs,
  }));
}

function wantsEmail(recipient: Recipient, topic: NotificationTopic): boolean {
  // A broadcast is the analyst writing to their own audience; following them
  // is the subscription, so there is no separate flag to consult.
  if (topic === 'BROADCAST') return true;
  // No preference row yet means the defaults apply, and the defaults opt in.
  if (!recipient.prefs) return true;
  if (topic === 'LIVE_SESSION') return recipient.prefs.emailOnLiveSession;
  if (topic === 'NEW_BET') return recipient.prefs.emailOnNewPrediction;
  return recipient.prefs.emailOnSettlement;
}

/**
 * Write one row per person per enabled channel.
 *
 * The Telegram destination is the CHAT ID, never a username: a username is
 * something a person typed and might not own, while a chat id only exists
 * because they opened a conversation with the bot themselves. Somebody who
 * switched the preference on but never pressed Start therefore has no address,
 * and gets a SKIPPED row rather than nothing at all - "we had nowhere to send
 * it" is a fact worth seeing, and it is not the same as a delivery failure.
 */
export async function enqueueForAnalystAudience(
  analystProfileId: string,
  topic: NotificationTopic,
  event: NotifiableEvent,
): Promise<{ queued: number; skipped: number; telegram: number; email: number }> {
  const recipients = await audienceFor(analystProfileId);
  const empty = { queued: 0, skipped: 0, telegram: 0, email: 0 };
  if (recipients.length === 0) return empty;

  const rows: Prisma.NotificationCreateManyInput[] = [];

  for (const recipient of recipients) {
    const common = {
      subjectKa: event.subjectKa,
      bodyKa: event.bodyKa,
      linkPath: event.linkPath,
      postId: event.postId ?? null,
      predictionId: event.predictionId ?? null,
      broadcastId: event.broadcastId ?? null,
    };

    if (wantsEmail(recipient, topic)) {
      rows.push({
        ...common,
        userId: recipient.userId,
        channel: 'EMAIL',
        status: 'PENDING',
        destination: recipient.email,
      });
    }

    if (recipient.prefs?.telegramEnabled) {
      const chatId = recipient.telegramChatId;
      rows.push({
        ...common,
        userId: recipient.userId,
        channel: 'TELEGRAM',
        status: chatId ? 'PENDING' : 'SKIPPED',
        destination: chatId,
        failureReason: chatId
          ? null
          : 'Telegram-ის ჩატი დაკავშირებული არაა (ბოტში Start არ დაუჭერია).',
      });
    }
  }

  if (rows.length === 0) return empty;

  await prisma.notification.createMany({ data: rows });

  const pending = rows.filter((row) => row.status === 'PENDING');

  return {
    queued: pending.length,
    skipped: rows.filter((row) => row.status === 'SKIPPED').length,
    telegram: pending.filter((row) => row.channel === 'TELEGRAM').length,
    email: pending.filter((row) => row.channel === 'EMAIL').length,
  };
}
