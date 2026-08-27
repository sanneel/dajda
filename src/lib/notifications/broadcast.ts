import { prisma } from '@/lib/db';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { enqueueForAnalystAudience } from './outbox';
import { flushTelegramOutbox } from './telegram-sender';
import { flushEmailOutbox } from './email-sender';
import {
  allowanceFromUsage,
  BROADCASTS_PER_DAY,
  startOfUtcDay,
  type BroadcastAllowance,
} from './broadcast-window';

/**
 * An analyst writing to their own audience.
 *
 * Two a day, counted in the DATABASE rather than in the in-process rate
 * limiter. The cap is a promise to the people receiving these - an inbox is
 * theirs, not the analyst's - and a limiter that forgets everything on the
 * next deploy cannot keep a promise. Counting rows also lets the dashboard
 * show "1 of 2 used today" honestly, and gives the analyst a history of what
 * they actually said.
 *
 * The arithmetic of the window lives in ./broadcast-window, importable
 * without Prisma so the promised rule is testable on its own.
 */

export { BROADCASTS_PER_DAY, startOfUtcDay };
export type { BroadcastAllowance };

export type BroadcastInput = { subjectKa: string; bodyKa: string };

export async function broadcastAllowance(
  analystProfileId: string,
  now: Date = new Date(),
): Promise<BroadcastAllowance> {
  const used = await prisma.analystBroadcast.count({
    where: {
      authorId: analystProfileId,
      createdAt: { gte: startOfUtcDay(now) },
    },
  });

  return allowanceFromUsage(used, now);
}

export type BroadcastResult = {
  broadcastId: string;
  recipients: number;
  telegram: number;
  email: number;
  /** Delivered before this call returned, across both channels. */
  sent: number;
  /** Left for the next sweep: either over the bound, or a failed attempt. */
  queued: number;
  remaining: number;
};

/**
 * Record the broadcast, queue a copy per recipient per channel, then deliver
 * them.
 *
 * The row is written BEFORE the fan-out, so a broadcast that fails halfway
 * through delivery still counts against the daily allowance. Spending an
 * attempt on a partial send is the safe direction to be wrong: the alternative
 * is a retry loop that messages the people it already reached.
 */
export async function sendBroadcast(
  input: BroadcastInput,
  analyst: { analystProfileId: string; slug: string; displayName: string },
  actor: { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
): Promise<BroadcastResult> {
  const allowance = await broadcastAllowance(analyst.analystProfileId);
  if (allowance.remaining <= 0) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      `დღეში ${BROADCASTS_PER_DAY} შეტყობინებაა დაშვებული. ლიმიტი განახლდება შუაღამეს.`,
    );
  }

  const broadcast = await prisma.analystBroadcast.create({
    data: {
      authorId: analyst.analystProfileId,
      subjectKa: input.subjectKa,
      bodyKa: input.bodyKa,
    },
    select: { id: true },
  });

  const queued = await enqueueForAnalystAudience(
    analyst.analystProfileId,
    'BROADCAST',
    {
      subjectKa: `${analyst.displayName}: ${input.subjectKa}`,
      bodyKa: input.bodyKa,
      linkPath: `/analysts/${analyst.slug}`,
      broadcastId: broadcast.id,
    },
  );

  await prisma.analystBroadcast.update({
    where: { id: broadcast.id },
    data: {
      recipientCount: queued.queued,
      telegramCount: queued.telegram,
      emailCount: queued.email,
    },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.BROADCAST_SENT,
    entityType: 'AnalystBroadcast',
    entityId: broadcast.id,
    summary: `შეტყობინება ${queued.queued} მიმღებს: ${input.subjectKa}`,
    actorId: actor.userId,
    actorRole: actor.role,
  });

  /*
   * Deliver inline, bounded, and scoped to THIS broadcast. A broadcast is an
   * explicit action the analyst is waiting on, so seeing "delivered to 40"
   * beats a spinner that resolves into nothing visible - but only if the
   * number is about the message they just sent, which is why the drain is
   * scoped rather than taking whatever is oldest in the queue. Anything past
   * the bound stays PENDING for the next sweep rather than holding this
   * request open.
   *
   * The two channels run in parallel because they are independent services:
   * a slow mail provider should not delay the Telegram copies.
   */
  const [telegram, email] = await Promise.all([
    flushTelegramOutbox({ broadcastId: broadcast.id, limit: 100 }),
    flushEmailOutbox({ broadcastId: broadcast.id, limit: 100 }),
  ]);

  const sent = telegram.sent + email.sent;

  return {
    broadcastId: broadcast.id,
    recipients: queued.queued,
    telegram: queued.telegram,
    email: queued.email,
    sent,
    queued: Math.max(0, queued.queued - sent),
    remaining: allowance.remaining - 1,
  };
}
