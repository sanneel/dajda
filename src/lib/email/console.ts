import type { EmailMessage, EmailSender, EmailSendResult } from './types';

/**
 * Development sender: prints the whole message to the server log.
 *
 * This is how verification and reset links are completed locally without an
 * SMTP account. Production refuses to run with this sender outside DEMO_MODE
 * (see the env guard) - a deployment that looks like it sends mail but only
 * logs it would be a silent failure of exactly the kind env.ts exists to
 * prevent.
 */

export const CONSOLE_EMAIL_CODE = 'console';

export class ConsoleEmailSender implements EmailSender {
  readonly code = CONSOLE_EMAIL_CODE;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info(
      [
        '[dajda] email (console sender - not delivered)',
        `  to:      ${message.to}`,
        `  subject: ${message.subject}`,
        ...message.text.split('\n').map((line) => `  | ${line}`),
      ].join('\n'),
    );

    return { delivered: true, providerMessageId: null };
  }
}
