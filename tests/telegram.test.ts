import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_AUTH_TTL_MS,
  telegramPlaceholderEmail,
  verifyTelegramAuth,
} from '@/lib/auth/telegram';

const BOT_TOKEN = '123456:TEST-secret-value';

/** Build a payload signed exactly the way Telegram signs one. */
function signed(
  fields: Record<string, string | number>,
  token = BOT_TOKEN,
): Record<string, unknown> {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  return { ...fields, hash };
}

const NOW = new Date('2026-08-24T12:00:00Z');
const FRESH_AUTH_DATE = Math.floor(NOW.getTime() / 1000) - 30;

describe('telegram login verification', () => {
  it('accepts a correctly signed, fresh payload', () => {
    const result = verifyTelegramAuth(
      signed({
        id: 777000,
        first_name: 'გიორგი',
        last_name: 'ბ.',
        username: 'giorgi_b',
        auth_date: FRESH_AUTH_DATE,
      }),
      BOT_TOKEN,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('777000');
      expect(result.data.firstName).toBe('გიორგი');
      expect(result.data.lastName).toBe('ბ.');
      expect(result.data.username).toBe('giorgi_b');
    }
  });

  it('rejects a payload whose fields were altered after signing', () => {
    const payload = signed({
      id: 777000,
      first_name: 'გიორგი',
      auth_date: FRESH_AUTH_DATE,
    });
    payload.id = 999999;

    const result = verifyTelegramAuth(payload, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a payload signed with a different bot token', () => {
    const payload = signed(
      { id: 777000, auth_date: FRESH_AUTH_DATE },
      '123456:some-other-bot',
    );
    const result = verifyTelegramAuth(payload, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a stale payload even with a valid signature', () => {
    const stale = Math.floor(
      (NOW.getTime() - TELEGRAM_AUTH_TTL_MS - 1000) / 1000,
    );
    const result = verifyTelegramAuth(
      signed({ id: 777000, auth_date: stale }),
      BOT_TOKEN,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects a payload from the future: that is forgery, not earliness', () => {
    const future = Math.floor(NOW.getTime() / 1000) + 600;
    const result = verifyTelegramAuth(
      signed({ id: 777000, auth_date: future }),
      BOT_TOKEN,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects shapes with no hash at all', () => {
    const result = verifyTelegramAuth(
      { id: '1', auth_date: String(FRESH_AUTH_DATE) },
      BOT_TOKEN,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('synthesises a placeholder address under a reserved TLD', () => {
    // .invalid can never resolve, so the address can never be delivered to
    // or registered by anyone.
    expect(telegramPlaceholderEmail('777000')).toBe(
      'tg-777000@telegram.invalid',
    );
  });
});
