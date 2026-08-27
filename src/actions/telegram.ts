'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import {
  createSession,
  setSessionCookie,
} from '@/lib/auth/session';
import { generateToken } from '@/lib/auth/tokens';
import { requireUser } from '@/lib/auth/authorization';
import {
  telegramPlaceholderEmail,
  verifyTelegramAuth,
} from '@/lib/auth/telegram';
import {
  createTelegramLink,
  unlinkTelegram,
} from '@/lib/notifications/telegram-link';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';

/**
 * Telegram sign-in.
 *
 * One action, two outcomes. A payload belonging to a known account opens a
 * session immediately. An unknown account is NOT created on the spot: the
 * caller gets `needsConfirm` back and must resubmit the same signed payload
 * with the 18+ and terms boxes ticked, because those two certifications are
 * taken at registration for every other account and Telegram cannot supply
 * either of them.
 *
 * The payload is re-verified on both passes - the confirmation round-trip
 * happens in the user's browser, so nothing about the first pass is trusted.
 */

export type TelegramAuthOutcome = {
  needsConfirm: boolean;
  /**
   * On `needsConfirm`, the raw payload echoed back so the confirmation form
   * can resubmit it. It is signed and was already in the browser's URL, so
   * round-tripping it reveals nothing.
   */
  payload?: string;
};

export async function telegramAuthAction(
  _previous: ActionResult<TelegramAuthOutcome> | null,
  formData: FormData,
): Promise<ActionResult<TelegramAuthOutcome>> {
  let success = false;

  try {
    const headerList = await headers();
    const context = {
      ipAddress:
        headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: headerList.get('user-agent'),
    };

    if (
      !rateLimiter.check(
        `login:ip:${context.ipAddress ?? 'unknown'}`,
        RATE_LIMITS.login,
      ).allowed
    ) {
      return fail(ERROR_CODES.RATE_LIMITED);
    }

    const botToken = getEnv().TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'Telegram-ით შესვლა ამ დაყენებაზე გამორთულია.',
      );
    }

    // The raw base64 JSON exactly as Telegram put it in the URL fragment.
    const rawPayload = String(formData.get('payload') ?? '');

    let payload: Record<string, unknown>;
    try {
      // Telegram uses URL-safe base64 in the fragment; normalise before decode,
      // because Node's plain 'base64' decoder silently skips '-' and '_'.
      const raw = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'Telegram-ის პასუხი არ იკითხება.');
    }

    const verified = verifyTelegramAuth(payload, botToken);
    if (!verified.ok) {
      return fail(
        ERROR_CODES.UNAUTHENTICATED,
        verified.reason === 'EXPIRED'
          ? 'Telegram-ის სესიას ვადა გაუვიდა. სცადეთ თავიდან.'
          : 'Telegram-ის ხელმოწერა ვერ დადასტურდა.',
      );
    }

    const telegram = verified.data;

    const existing = await prisma.user.findUnique({
      where: { telegramId: telegram.id },
      select: { id: true, role: true, status: true },
    });

    if (existing) {
      // The same single message as password login: a suspended account is
      // indistinguishable from a failed attempt.
      if (existing.status !== 'ACTIVE') {
        return fail(ERROR_CODES.UNAUTHENTICATED, 'შესვლა ვერ მოხერხდა.');
      }

      const session = await createSession(existing.id, context);
      await setSessionCookie(session.token, session.expiresAt);

      await writeAuditLog({
        action: AUDIT_ACTIONS.USER_LOGGED_IN,
        entityType: 'User',
        entityId: existing.id,
        summary: 'შესვლა Telegram-ით',
        actorId: existing.id,
        actorRole: existing.role,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      success = true;
    } else {
      const ageConfirmed = formData.get('ageConfirmed') === 'on';
      const acceptTerms = formData.get('acceptTerms') === 'on';

      if (!ageConfirmed || !acceptTerms) {
        // First pass for a new account: send the certifications form back.
        return ok({ needsConfirm: true, payload: rawPayload });
      }

      const name =
        [telegram.firstName, telegram.lastName].filter(Boolean).join(' ') ||
        telegram.username ||
        `Telegram ${telegram.id}`;

      /*
       * The password column is non-null, so the account gets a random digest
       * nobody knows. Password login for this account is therefore impossible
       * until the user sets one through the reset flow - which needs a real
       * email, which the placeholder address deliberately is not.
       */
      const password = await hashPassword(generateToken());

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: name.slice(0, 80),
            email: telegramPlaceholderEmail(telegram.id),
            password,
            telegramId: telegram.id,
            telegramUsername: telegram.username,
            ageConfirmedAt: new Date(),
          },
          select: { id: true, role: true },
        });

        await tx.notificationPreference.create({
          data: {
            userId: created.id,
            telegramUsername: telegram.username,
          },
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.USER_REGISTERED,
            entityType: 'User',
            entityId: created.id,
            summary: `ახალი მომხმარებელი Telegram-ით: ${name}`,
            actorId: created.id,
            actorRole: created.role,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          tx,
        );

        return created;
      });

      const session = await createSession(user.id, context);
      await setSessionCookie(session.token, session.expiresAt);
      success = true;
    }
  } catch (error) {
    return toActionFailure(error);
  }

  if (success) redirect('/dashboard');
  return fail(ERROR_CODES.INTERNAL);
}

/**
 * Start connecting this account to the bot.
 *
 * Returns the deep link rather than redirecting, because the caller has to
 * open it in a new tab: a same-tab redirect to t.me leaves the person on
 * Telegram's web page with no way back to the settings they came from.
 *
 * The chat is not connected when this returns - it is connected when they
 * press Start and the bot's webhook redeems the token. The UI says so.
 */
export async function startTelegramLinkAction(
  _previous: ActionResult<{ url: string }> | null,
): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = await requireUser();

    const link = await createTelegramLink(actor.userId);
    if (!link) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'Telegram-ის ბოტი ამ დაყენებაზე კონფიგურირებული არაა.',
      );
    }

    return ok(link);
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Disconnect the chat. The same path the bot's /stop command takes. */
export async function unlinkTelegramAction(
  _previous: ActionResult<{ unlinked: true }> | null,
): Promise<ActionResult<{ unlinked: true }>> {
  try {
    const actor = await requireUser();
    await unlinkTelegram(actor.userId);
    revalidatePath('/dashboard/settings');
    return ok({ unlinked: true });
  } catch (error) {
    return toActionFailure(error);
  }
}
