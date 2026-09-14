import { prisma } from '@/lib/db';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';

/**
 * The analyst's feed: posts, not bets.
 *
 * A post interrupts nobody. It sits on the feed and is read when it is read -
 * the one thing here that reaches an inbox is a new bet, and that is a
 * different table.
 *
 * A post never touches the record either. Accuracy and units are computed from
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
