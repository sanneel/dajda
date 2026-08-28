import { getEnv } from '@/lib/env';
import { getEmailProvider } from './email';
import { renderEmailHtml } from './email/template';
import { drainOutbox, type OutboxMessage } from './drain';

/**
 * The email side of the outbox.
 *
 * Same shape as the Telegram sender and the same queue underneath: this file
 * only knows how to turn one row into one message and hand it to the
 * configured provider.
 */

/**
 * Every message ends with where it came from and how to stop it.
 *
 * Not decoration: unsolicited-looking mail with no visible way out is what
 * spam filters and recipients both punish, and the settings page is the real
 * off switch rather than a token one - it turns off the actual preference the
 * outbox consults.
 */
function renderBody(message: OutboxMessage): string {
  const appUrl = getEnv().APP_URL;
  const link = message.linkPath ? `${appUrl}${message.linkPath}` : null;

  return [
    message.bodyKa,
    link ? `\n${link}` : null,
    '\n***',
    'DAJDA · სპორტული ანალიზი, გამჭვირვალე ჩანაწერით.',
    `შეტყობინებების გამორთვა: ${appUrl}/dashboard/settings`,
  ]
    .filter((part) => part !== null)
    .join('\n');
}

/**
 * The styled twin of renderBody: the same words, the same link, the same
 * opt-out, through the shared template. The subject doubles as the heading
 * because an outbox row has no separate title to offer.
 */
function renderHtml(message: OutboxMessage): string {
  const appUrl = getEnv().APP_URL;
  return renderEmailHtml({
    heading: message.subjectKa,
    paragraphs: message.bodyKa.split(/\n+/).filter((line) => line.trim()),
    ...(message.linkPath
      ? { cta: { label: 'გახსნა DAJDA-ზე', url: `${appUrl}${message.linkPath}` } }
      : {}),
    footerLines: [
      `შეტყობინებების გამორთვა: ${appUrl}/dashboard/settings`,
    ],
  });
}

export async function flushEmailOutbox(options?: {
  limit?: number;
  broadcastId?: string;
}): Promise<{ sent: number; failed: number }> {
  const provider = getEmailProvider();

  return drainOutbox({
    channel: 'EMAIL',
    limit: options?.limit,
    broadcastId: options?.broadcastId,
    send: (message) =>
      provider.send({
        to: message.destination,
        subject: message.subjectKa,
        text: renderBody(message),
        html: renderHtml(message),
      }),
  });
}
