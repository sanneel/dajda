import { prisma } from '@/lib/db';
import { expiryFrom, generateToken, hashToken } from '@/lib/auth/tokens';
import { telegramLinkUrl } from '@/lib/auth/telegram';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';

/**
 * Connecting an account to a Telegram chat.
 *
 * A bot cannot start a conversation - Telegram forbids it - so there is no way
 * to "add someone" to notifications from our side. The person has to open the
 * chat themselves, and the only question is how we know which account the chat
 * belongs to. The answer is a one-time token carried in the deep link: they
 * press Start, Telegram sends the bot `/start <token>`, and the token names
 * the account. Nobody types a username, so nobody can claim someone else's.
 *
 * The token is short-lived and single-use, and only its hash is stored - the
 * same treatment as every other bearer token in the product.
 */

/** Long enough to switch apps and press a button, short enough to be useless if leaked. */
export const TELEGRAM_LINK_TTL_MS = 30 * 60 * 1000;

/**
 * Issue a fresh link. Any earlier unused token for this account is consumed
 * first, so a link that was left open in another tab cannot still be used
 * after the person has generated a new one.
 */
export async function createTelegramLink(
  userId: string,
): Promise<{ url: string } | null> {
  const token = generateToken();

  const url = telegramLinkUrl(token);
  if (!url) return null;

  await prisma.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: { userId, purpose: 'TELEGRAM_LINK', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.authToken.create({
      data: {
        userId,
        purpose: 'TELEGRAM_LINK',
        tokenHash: hashToken(token),
        expiresAt: expiryFrom(new Date(), TELEGRAM_LINK_TTL_MS),
      },
    });
  });

  return { url };
}

export type LinkOutcome =
  | { ok: true; userId: string; name: string }
  | { ok: false; reason: 'UNKNOWN_TOKEN' | 'EXPIRED' | 'ALREADY_LINKED' };

/**
 * Redeem a `/start` payload: bind this chat to the account that issued it.
 *
 * Turning notifications on here is deliberate. Pressing Start in the bot IS
 * the opt-in - it is a clearer expression of "message me" than a checkbox -
 * and leaving the preference off would connect a chat that then stayed silent
 * for no visible reason.
 */
export async function redeemTelegramLink(
  rawToken: string,
  chat: { chatId: string; username: string | null },
): Promise<LinkOutcome> {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      userId: true,
      purpose: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { name: true, telegramChatId: true } },
    },
  });

  if (!record || record.purpose !== 'TELEGRAM_LINK' || record.consumedAt) {
    return { ok: false, reason: 'UNKNOWN_TOKEN' };
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  /*
   * The chat id is unique across users. If this chat already belongs to
   * somebody else, the claim is refused rather than moved: silently
   * transferring it would redirect one person's notifications to another's
   * phone, which is the worst thing this table can get wrong.
   */
  const owner = await prisma.user.findUnique({
    where: { telegramChatId: chat.chatId },
    select: { id: true },
  });
  if (owner && owner.id !== record.userId) {
    return { ok: false, reason: 'ALREADY_LINKED' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.authToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    await tx.user.update({
      where: { id: record.userId },
      data: {
        telegramChatId: chat.chatId,
        telegramLinkedAt: new Date(),
        ...(chat.username ? { telegramUsername: chat.username } : {}),
      },
    });

    await tx.notificationPreference.upsert({
      where: { userId: record.userId },
      create: {
        userId: record.userId,
        telegramEnabled: true,
        telegramUsername: chat.username,
      },
      update: {
        telegramEnabled: true,
        ...(chat.username ? { telegramUsername: chat.username } : {}),
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.TELEGRAM_LINKED,
        entityType: 'User',
        entityId: record.userId,
        summary: 'Telegram-ის ჩატი დაუკავშირდა ანგარიშს',
        actorId: record.userId,
      },
      tx,
    );
  });

  return { ok: true, userId: record.userId, name: record.user.name };
}

/**
 * Disconnect: forget the chat and stop Telegram delivery.
 *
 * Clearing the chat id is what actually stops messages; the preference flag is
 * turned off too so the settings page does not claim an active channel with no
 * address behind it. Used by both the /stop command in the bot and the button
 * in settings, so the two cannot disagree.
 */
export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });

    await tx.notificationPreference.updateMany({
      where: { userId },
      data: { telegramEnabled: false },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.TELEGRAM_UNLINKED,
        entityType: 'User',
        entityId: userId,
        summary: 'Telegram-ის ჩატი გაითიშა',
        actorId: userId,
      },
      tx,
    );
  });
}

/** Resolve the account a chat belongs to, for bot commands like /stop. */
export async function userForChat(chatId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true },
  });
  return user?.id ?? null;
}
