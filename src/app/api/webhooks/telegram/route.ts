import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { sendTelegramMessage } from '@/lib/notifications/telegram-sender';
import {
  redeemTelegramLink,
  unlinkTelegram,
  userForChat,
} from '@/lib/notifications/telegram-link';

/**
 * The bot's inbox.
 *
 * Telegram POSTs every update here. Only two of them matter: `/start <token>`,
 * which binds the chat to an account, and `/stop`, which unbinds it.
 *
 * AUTHENTICATION is the secret header, not the URL. Telegram echoes the value
 * given to setWebhook in X-Telegram-Bot-Api-Secret-Token on every call, and
 * without a match this route does nothing - otherwise anyone who found the
 * address could post "chat 123 is user X" and start receiving that person's
 * notifications.
 *
 * Every outcome answers 200. Telegram retries non-2xx responses for hours,
 * and a malformed update or an expired token is settled, not transient - the
 * person is told what happened in the chat instead.
 */
export const dynamic = 'force-dynamic';

const OK = new Response(null, { status: 200 });

export async function POST(request: Request) {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    // Not configured: nothing to authenticate against, so nothing is trusted.
    return new Response(null, { status: 503 });
  }

  const presented = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secretMatches(presented, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response(null, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return OK;
  }

  const message = readMessage(update);
  if (!message) return OK;

  const { chatId, text, username } = message;
  const [command, argument] = text.trim().split(/\s+/, 2);

  if (command === '/start') {
    if (!argument) {
      await sendTelegramMessage(
        chatId,
        'გამარჯობა! შეტყობინებების ჩასართავად გახსენით DAJDA → პარამეტრები → Telegram და დააჭირეთ დაკავშირებას.',
      );
      return OK;
    }

    const outcome = await redeemTelegramLink(argument, { chatId, username });
    await sendTelegramMessage(chatId, startReply(outcome));
    return OK;
  }

  if (command === '/stop') {
    const userId = await userForChat(chatId);
    if (userId) await unlinkTelegram(userId);
    await sendTelegramMessage(
      chatId,
      userId
        ? 'შეტყობინებები გამორთულია. ხელახლა ჩასართავად დაუბრუნდით DAJDA-ს პარამეტრებს.'
        : 'ეს ჩატი არცერთ ანგარიშს არ უკავშირდება.',
    );
    return OK;
  }

  return OK;
}

function startReply(
  outcome: Awaited<ReturnType<typeof redeemTelegramLink>>,
): string {
  if (outcome.ok) {
    return `დაკავშირება დასრულდა, ${outcome.name}. აქედან მიიღებთ ავტორების შეტყობინებებს. გამორთვა: /stop`;
  }
  if (outcome.reason === 'EXPIRED') {
    return 'ბმულს ვადა გაუვიდა. დააგენერირეთ ახალი DAJDA-ს პარამეტრებში.';
  }
  if (outcome.reason === 'ALREADY_LINKED') {
    return 'ეს ჩატი უკვე სხვა ანგარიშზეა მიბმული. ჯერ გამორთეთ იქ: /stop';
  }
  return 'ბმული არ მოქმედებს. დააგენერირეთ ახალი DAJDA-ს პარამეტრებში.';
}

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Pull the one shape we act on out of an update. Everything else - edits,
 * channel posts, callbacks, joins - is ignored rather than parsed.
 */
function readMessage(
  update: unknown,
): { chatId: string; text: string; username: string | null } | null {
  if (typeof update !== 'object' || update === null) return null;
  const message = (update as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;

  const chat = (message as { chat?: unknown }).chat;
  const text = (message as { text?: unknown }).text;
  const from = (message as { from?: unknown }).from;
  if (typeof chat !== 'object' || chat === null) return null;
  if (typeof text !== 'string') return null;

  const id = (chat as { id?: unknown }).id;
  if (typeof id !== 'number' && typeof id !== 'string') return null;

  const rawUsername =
    typeof from === 'object' && from !== null
      ? (from as { username?: unknown }).username
      : undefined;

  return {
    chatId: String(id),
    text,
    username: typeof rawUsername === 'string' ? rawUsername : null,
  };
}
