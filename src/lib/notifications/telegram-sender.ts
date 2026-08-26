import { getEnv } from '@/lib/env';
import { drainOutbox, type DeliveryResult, type OutboxMessage } from './drain';

/**
 * The Telegram side of the outbox.
 *
 * Same shape as the email sender and the same queue underneath: this file only
 * knows how to turn one row into one message and hand it to the Bot API.
 */

const API_BASE = 'https://api.telegram.org';

/** Telegram's own hard cap on a message body. */
const MAX_MESSAGE_CHARS = 4096;

/**
 * Send one message. Returns a result rather than throwing: a failed delivery
 * is an outcome to record against the row, not an exception to unwind a
 * broadcast with.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<DeliveryResult> {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, reason: 'ბოტი არ არის კონფიგურირებული.', permanent: true };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, MAX_MESSAGE_CHARS),
        // No parse_mode: message bodies are user-authored Georgian prose, and
        // interpreting them as markup would let a stray '*' or '_' break the
        // send outright. Plain text cannot fail to parse.
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    // Network-level failure: worth retrying.
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'network error',
      permanent: false,
    };
  }

  if (response.ok) return { ok: true };

  const body = await response.text().catch(() => '');
  /*
   * 403 is the one that matters: the person blocked the bot or deleted the
   * chat. That is a decision, not an outage, so it must not be retried - and
   * it is exactly the case that would otherwise fill the queue with garbage.
   * A 401 is our own bad token, which a retry after fixing config CAN cure,
   * so it stays retryable.
   */
  const permanent = response.status === 400 || response.status === 403;

  return {
    ok: false,
    reason: `${response.status} ${body.slice(0, 200)}`,
    permanent,
  };
}

function renderMessage(message: OutboxMessage): string {
  const url = message.linkPath
    ? `${getEnv().APP_URL}${message.linkPath}`
    : null;

  return [message.subjectKa, '', message.bodyKa, url ? `\n${url}` : null]
    .filter((part) => part !== null)
    .join('\n');
}

export async function flushTelegramOutbox(options?: {
  limit?: number;
  broadcastId?: string;
}): Promise<{ sent: number; failed: number }> {
  // Without a token every send is a guaranteed failure; burning attempts on
  // rows that could succeed once it is configured would be worse than waiting.
  if (!getEnv().TELEGRAM_BOT_TOKEN) return { sent: 0, failed: 0 };

  return drainOutbox({
    channel: 'TELEGRAM',
    limit: options?.limit,
    broadcastId: options?.broadcastId,
    send: (message) =>
      sendTelegramMessage(message.destination, renderMessage(message)),
  });
}
