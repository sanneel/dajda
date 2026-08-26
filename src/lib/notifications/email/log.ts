import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

export const LOG_PROVIDER_CODE = 'log';

/**
 * The development provider: prints instead of sending.
 *
 * This is the default, and the default has to be the one that cannot reach a
 * real person. Someone running the app locally with seeded demo accounts
 * would otherwise mail addresses they do not own the moment they pressed a
 * button, and "it only sends if you configure it" is the only version of that
 * which is safe to get wrong.
 *
 * It reports success, so the outbox rows move to SENT and the delivery path
 * is exercised end to end rather than being a branch nobody runs until
 * production.
 */
export class LogEmailProvider implements EmailProvider {
  readonly code = LOG_PROVIDER_CODE;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info(
      `[dajda:email] → ${message.to}\n  ${message.subject}\n  ${message.text.replace(/\n/g, '\n  ')}`,
    );
    return { ok: true };
  }
}
