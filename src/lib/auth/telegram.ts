import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Telegram login.
 *
 * The flow is Telegram's redirect ("no widget") variant: the login button is a
 * plain link to oauth.telegram.org, and Telegram sends the browser back to
 * /auth/telegram with a signed JSON payload in the URL FRAGMENT. A small page
 * script forwards that payload to a server action, and everything below is the
 * server deciding whether to believe it.
 *
 * The external widget script was rejected on purpose: this app ships a strict
 * nonce-based CSP, and the link flow needs no third-party script, no iframe
 * and therefore no CSP loosening.
 *
 * `verifyTelegramAuth` is pure (token and clock are parameters) so the
 * signature scheme is unit-testable without network or env.
 */

/** What Telegram signs. Everything is a string because it arrives as JSON/URL. */
export type TelegramAuthData = {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  authDate: Date;
};

export type TelegramVerifyResult =
  | { ok: true; data: TelegramAuthData }
  | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' };

/**
 * Signed payloads expire quickly. Long enough to read the confirmation form
 * on a slow connection, short enough that a leaked payload is soon worthless.
 */
export const TELEGRAM_AUTH_TTL_MS = 15 * 60 * 1000;

/**
 * Check a payload against Telegram's scheme: the hash field must equal
 * HMAC-SHA256 over the remaining fields serialised as sorted `key=value`
 * lines, keyed with SHA256(bot token).
 */
export function verifyTelegramAuth(
  payload: Record<string, unknown>,
  botToken: string,
  now: Date = new Date(),
): TelegramVerifyResult {
  const hash = payload.hash;
  const id = payload.id;
  const authDate = payload.auth_date;
  if (
    typeof hash !== 'string' ||
    (typeof id !== 'string' && typeof id !== 'number') ||
    (typeof authDate !== 'string' && typeof authDate !== 'number')
  ) {
    return { ok: false, reason: 'MALFORMED' };
  }

  const checkString = Object.keys(payload)
    .filter(
      (key) =>
        key !== 'hash' &&
        payload[key] !== undefined &&
        payload[key] !== null,
    )
    .sort()
    .map((key) => `${key}=${String(payload[key])}`)
    .join('\n');

  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || b.length === 0 || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const issuedAtMs = Number(authDate) * 1000;
  if (
    !Number.isFinite(issuedAtMs) ||
    now.getTime() - issuedAtMs > TELEGRAM_AUTH_TTL_MS ||
    // A payload from the future is forged, not early.
    issuedAtMs - now.getTime() > 60 * 1000
  ) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const firstName =
    typeof payload.first_name === 'string' ? payload.first_name.trim() : '';

  return {
    ok: true,
    data: {
      id: String(id),
      firstName,
      lastName:
        typeof payload.last_name === 'string' && payload.last_name.trim()
          ? payload.last_name.trim()
          : null,
      username:
        typeof payload.username === 'string' && payload.username.trim()
          ? payload.username.trim()
          : null,
      authDate: new Date(issuedAtMs),
    },
  };
}

/**
 * The address the login button points at, or null when no bot is configured -
 * callers hide the button rather than rendering a dead one.
 */
export function telegramLoginUrl(): string | null {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN) return null;

  const botId = env.TELEGRAM_BOT_TOKEN.split(':')[0];
  const query = new URLSearchParams({
    bot_id: botId ?? '',
    origin: env.APP_URL,
    return_to: `${env.APP_URL}/auth/telegram`,
    request_access: 'write',
  });

  return `https://oauth.telegram.org/auth?${query.toString()}`;
}

/**
 * A Telegram-created account has no mailbox, but the schema requires a unique
 * address. This synthesises one under a reserved invalid TLD so it can never
 * collide with, or be mistaken for, a deliverable address.
 */
export function telegramPlaceholderEmail(telegramId: string): string {
  return `tg-${telegramId}@telegram.invalid`;
}

/** Can the bot be linked and messaged at all on this deployment? */
export function telegramBotConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
}

/**
 * The deep link that opens the bot with a one-time linking payload.
 *
 * Telegram hands the payload back to the bot as `/start <payload>` when the
 * person presses Start, which is the whole mechanism: we never learn a chat id
 * by asking for a username, we learn it because they opened a conversation and
 * brought our token with them.
 *
 * The payload must match Telegram's own rule for the start parameter: up to 64
 * characters of [A-Za-z0-9_-], which base64url tokens already satisfy.
 */
export function telegramLinkUrl(token: string): string | null {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_USERNAME) return null;
  return `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`;
}
