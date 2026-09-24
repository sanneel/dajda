import { prisma } from '@/lib/db';
import type { NotificationChannel } from '@/generated/prisma/enums';

/**
 * The queue mechanics, shared by every channel.
 *
 * What differs between Telegram and email is one function - how to hand a
 * message to the outside world. Everything else (which rows are due, how many
 * attempts they get, what a failure does to their status) is identical, and
 * writing it twice would mean two subtly different answers to "did this
 * message get delivered".
 *
 * Two limits are deliberate:
 *
 *   1. A bounded number of rows per call, so a broadcast to a large audience
 *      is drained across several calls instead of holding one request open.
 *   2. A bounded number of attempts per row. An address that fails forever -
 *      a blocked bot, a dead mailbox - would otherwise starve everyone else.
 */

/** After this many failed attempts a row is left alone as FAILED. */
const MAX_ATTEMPTS = 3;

/**
 * A queued message older than this is expired, not sent. Everything that goes
 * through the outbox is about the moment: a bet going live, a bet settled, an
 * author's broadcast, an admin alert. Delivered days late it is noise, and a
 * backlog released at once (as the first sweep after an outage would) is a
 * burst of announcements for matches long over. Charge notices do not use the
 * outbox and are unaffected.
 */
export const MAX_QUEUE_AGE_MS = 48 * 60 * 60 * 1000;

export type DeliveryResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      /** True when retrying is pointless: a refusal, not an outage. */
      permanent: boolean;
    };

export type OutboxMessage = {
  id: string;
  /** Guaranteed non-null: rows without one are not selected. */
  destination: string;
  subjectKa: string;
  bodyKa: string;
  linkPath: string | null;
  attempts: number;
};

export type DrainOptions = {
  channel: NotificationChannel;
  send: (message: OutboxMessage) => Promise<DeliveryResult>;
  limit?: number;
  /**
   * Narrow the drain to one broadcast. Without it a fresh broadcast would
   * spend its budget on whatever backlog happened to be older, and the
   * "delivered to N" the analyst is shown would be counting somebody else's
   * message. Unscoped is for the general retry sweep, where oldest-first is
   * exactly right.
   */
  broadcastId?: string;
  /**
   * Narrow to specific rows: the inline delivery of something just written,
   * such as an administrator alert, where the caller knows exactly which rows
   * it created and wants nothing else sent on its request.
   */
  ids?: string[];
  /** Narrow to one bet's announcements, for the same reason as `ids`. */
  predictionId?: string;
};

/**
 * Deliver pending rows on one channel.
 *
 * Sequential rather than parallel on purpose: every provider here rate-limits,
 * and answering a burst with 429s would cost deliverability to buy latency
 * nobody is watching.
 */
export async function drainOutbox({
  channel,
  send,
  limit = 50,
  broadcastId,
  ids,
  predictionId,
}: DrainOptions): Promise<{ sent: number; failed: number; expired: number }> {
  const cutoff = new Date(Date.now() - MAX_QUEUE_AGE_MS);
  const { count: expired } = await prisma.notification.updateMany({
    where: { channel, status: 'PENDING', createdAt: { lt: cutoff } },
    data: {
      status: 'FAILED',
      failureReason: 'expired: queued too long to still be worth sending',
    },
  });

  const rows = await prisma.notification.findMany({
    where: {
      channel,
      status: 'PENDING',
      destination: { not: null },
      attempts: { lt: MAX_ATTEMPTS },
      createdAt: { gte: cutoff },
      ...(broadcastId ? { broadcastId } : {}),
      ...(ids ? { id: { in: ids } } : {}),
      ...(predictionId ? { predictionId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      destination: true,
      subjectKa: true,
      bodyKa: true,
      linkPath: true,
      attempts: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const message: OutboxMessage = {
      ...row,
      // The `destination: { not: null }` filter guarantees this.
      destination: row.destination as string,
    };

    const result = await send(message);
    const attempts = row.attempts + 1;

    if (result.ok) {
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts,
          failureReason: null,
        },
      });
      sent += 1;
      continue;
    }

    const exhausted = result.permanent || attempts >= MAX_ATTEMPTS;
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        // Still PENDING while retries remain, so the next sweep picks it up.
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts,
        failureReason: result.reason,
      },
    });
    failed += 1;
  }

  return { sent, failed, expired };
}
