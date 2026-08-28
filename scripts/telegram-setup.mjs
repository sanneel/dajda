/**
 * Registers the bot's webhook with Telegram, and reports what is actually
 * configured on both sides.
 *
 * This existed only as a curl in a comment in .env.example, which is a bad
 * place for it: the URL has to be built by hand, a typo in the secret is
 * invisible until notifications silently stop, and nothing tells you whether
 * Telegram accepted the address or has been failing to reach it for a week.
 *
 *   npm run telegram:setup           register the webhook, then show its state
 *   npm run telegram:setup -- --info show the state without changing anything
 *   npm run telegram:setup -- --delete   remove the webhook
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME
 * and APP_URL from the environment. Deliberately dependency-free.
 */
import 'dotenv/config';
import process from 'node:process';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const username = process.env.TELEGRAM_BOT_USERNAME;
const appUrl = process.env.APP_URL;

const INFO_ONLY = process.argv.includes('--info');
const DELETE = process.argv.includes('--delete');

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!token) {
  fail(
    'TELEGRAM_BOT_TOKEN is not set.\n' +
      'BotFather gives it to you when the bot is created, and /token issues a new one.',
  );
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    // Telegram's own description is far more useful than a status code.
    fail(
      `${method} failed: ${payload?.description ?? `HTTP ${response.status}`}`,
    );
  }
  return payload.result;
}

/** Never print the token, even partially: a prefix is still a prefix. */
function describeWebhook(info) {
  const lines = [
    `  url:                  ${info.url || '(none)'}`,
    `  custom certificate:   ${info.has_custom_certificate ? 'yes' : 'no'}`,
    `  pending updates:      ${info.pending_update_count}`,
    `  secret token set:     ${info.url ? 'yes (Telegram does not echo it back)' : 'no'}`,
  ];
  if (info.allowed_updates) {
    lines.push(`  allowed updates:      ${info.allowed_updates.join(', ')}`);
  }
  if (info.last_error_message) {
    lines.push(
      `  LAST ERROR:           ${info.last_error_message}`,
      `  last error at:        ${new Date(info.last_error_date * 1000).toISOString()}`,
    );
  }
  return lines.join('\n');
}

const me = await call('getMe');
console.info(`\nBot: @${me.username} (${me.first_name}, id ${me.id})`);

if (username && username !== me.username) {
  fail(
    `TELEGRAM_BOT_USERNAME is "${username}" but this token belongs to @${me.username}.\n` +
      'The deep link would open a different bot than the one that answers.',
  );
}
if (!username) {
  console.warn(
    `  TELEGRAM_BOT_USERNAME is unset. Set it to "${me.username}" or the\n` +
      '  t.me link that connects an account cannot be built.',
  );
}

if (DELETE) {
  await call('deleteWebhook', { drop_pending_updates: false });
  console.info('\nWebhook removed.');
  console.info(describeWebhook(await call('getWebhookInfo')));
  process.exit(0);
}

if (!INFO_ONLY) {
  if (!secret) {
    fail(
      'TELEGRAM_WEBHOOK_SECRET is not set.\n' +
        'It is what proves a webhook call came from Telegram; without it the\n' +
        'endpoint refuses every request. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (!appUrl || !appUrl.startsWith('https://')) {
    fail(
      `APP_URL must be the public https origin (got ${appUrl ?? 'nothing'}).\n` +
        'Telegram will not deliver to http, to localhost, or to a private address.',
    );
  }

  const url = `${appUrl.replace(/\/$/, '')}/api/webhooks/telegram`;
  await call('setWebhook', {
    url,
    secret_token: secret,
    // The inbox handles /start and /stop and nothing else, so there is no
    // reason to receive edits, channel posts or reactions.
    allowed_updates: ['message'],
  });
  console.info(`\nWebhook set to ${url}`);
}

console.info('\nWebhook state:');
console.info(describeWebhook(await call('getWebhookInfo')));
console.info(
  '\nRemaining BotFather steps, if not done already:\n' +
    `  /setdomain  ->  @${me.username}  ->  ${appUrl ?? '<your https origin>'}\n` +
    '  (required for "log in with Telegram"; without it Telegram refuses the redirect)\n',
);
