import { prisma } from '@/lib/db';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { enqueueForAnalystAudience } from '@/lib/notifications/outbox';
import { formatDateTimeKa } from '@/lib/format';

/**
 * The analyst's feed: posts, not bets.
 *
 * Three kinds, and the difference between them is who gets interrupted:
 *
 *   NOTE         nobody. It sits on the feed and is read when read.
 *   LIVE_NOTICE  the author's audience, once. It is an appointment: "I am
 *                betting live at this time on this match", so it is the one
 *                thing here worth a mail or a Telegram message.
 *   LIVE_UPDATE  nobody. Someone watching a running session is already here;
 *                notifying on every update would train people to mute the
 *                channel, which would cost the notices too.
 *
 * A post never touches the record. Accuracy and units are computed from
 * Prediction rows only, so nothing an analyst writes can move their numbers.
 */

type Actor = { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' };

export async function createNote(
  input: { bodyKa: string },
  analystProfileId: string,
  actor: Actor,
) {
  const post = await prisma.analystPost.create({
    data: { authorId: analystProfileId, kind: 'NOTE', bodyKa: input.bodyKa },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.POST_PUBLISHED,
    entityType: 'AnalystPost',
    entityId: post.id,
    summary: `სტატუსი გამოქვეყნდა: ${input.bodyKa.slice(0, 60)}`,
    actorId: actor.userId,
    actorRole: actor.role,
  });

  return post;
}

/**
 * Announce a live session.
 *
 * The audience is notified here and only here. The message text is composed
 * now and stored on the outbox row, so editing or deleting the notice later
 * cannot rewrite what people were told.
 */
export async function announceLiveSession(
  input: { bodyKa: string; liveAt: Date; liveLabelKa: string },
  analyst: { analystProfileId: string; displayName: string; slug: string },
  actor: Actor,
) {
  if (input.liveAt.getTime() < Date.now() - 60 * 60 * 1000) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'ლაივის დრო წარსულშია.',
    );
  }

  const post = await prisma.analystPost.create({
    data: {
      authorId: analyst.analystProfileId,
      kind: 'LIVE_NOTICE',
      bodyKa: input.bodyKa,
      liveAt: input.liveAt,
      liveLabelKa: input.liveLabelKa,
    },
  });

  const { queued, skipped } = await enqueueForAnalystAudience(
    analyst.analystProfileId,
    'LIVE_SESSION',
    {
      subjectKa: `${analyst.displayName}: ლაივი ${formatDateTimeKa(input.liveAt)}`,
      bodyKa: `${input.liveLabelKa}\n\n${input.bodyKa}`,
      linkPath: `/analysts/${analyst.slug}`,
      postId: post.id,
    },
  );

  await writeAuditLog({
    action: AUDIT_ACTIONS.LIVE_ANNOUNCED,
    entityType: 'AnalystPost',
    entityId: post.id,
    summary: `ლაივი გამოცხადდა: ${input.liveLabelKa}`,
    actorId: actor.userId,
    actorRole: actor.role,
    metadata: { queued, skipped },
  });

  return { post, queued, skipped };
}

/** Post an update inside a session the caller owns and has not ended. */
export async function postLiveUpdate(
  input: { parentId: string; bodyKa: string },
  analystProfileId: string,
) {
  const parent = await prisma.analystPost.findUnique({
    where: { id: input.parentId },
    select: { id: true, authorId: true, kind: true, endedAt: true },
  });

  if (!parent || parent.kind !== 'LIVE_NOTICE') {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'ლაივი ვერ მოიძებნა.');
  }
  // Ownership is checked against the session's profile, never against an id
  // that arrived in the form.
  if (parent.authorId !== analystProfileId) {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  if (parent.endedAt) {
    throw new AppError(ERROR_CODES.CONFLICT, 'ეს ლაივი დასრულებულია.');
  }

  return prisma.analystPost.create({
    data: {
      authorId: analystProfileId,
      kind: 'LIVE_UPDATE',
      bodyKa: input.bodyKa,
      parentId: parent.id,
    },
  });
}

/** Close a session. Irreversible: reopening would falsify the timeline. */
export async function endLiveSession(
  postId: string,
  analystProfileId: string,
  actor: Actor,
) {
  const post = await prisma.analystPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, kind: true, endedAt: true },
  });

  if (!post || post.kind !== 'LIVE_NOTICE') {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'ლაივი ვერ მოიძებნა.');
  }
  if (post.authorId !== analystProfileId && actor.role !== 'ADMIN') {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  if (post.endedAt) return post;

  return prisma.analystPost.update({
    where: { id: post.id },
    data: { endedAt: new Date() },
  });
}

/** An analyst may remove their own post. Bets are not deletable; posts are. */
export async function deletePost(
  postId: string,
  analystProfileId: string,
  actor: Actor,
) {
  const post = await prisma.analystPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, bodyKa: true },
  });

  if (!post) throw new AppError(ERROR_CODES.NOT_FOUND);
  if (post.authorId !== analystProfileId && actor.role !== 'ADMIN') {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }

  await prisma.analystPost.delete({ where: { id: post.id } });

  await writeAuditLog({
    action: AUDIT_ACTIONS.POST_DELETED,
    entityType: 'AnalystPost',
    entityId: post.id,
    summary: `პოსტი წაიშალა: ${post.bodyKa.slice(0, 60)}`,
    actorId: actor.userId,
    actorRole: actor.role,
  });
}
