import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSender, EmailSendResult } from './types';

/**
 * SMTP sender.
 *
 * SMTP rather than a vendor HTTP API because it is the one protocol every
 * provider speaks - a Mailgun, Postmark, Resend or plain hosting mailbox all
 * hand out SMTP credentials, so switching providers is an .env edit and never
 * a code change.
 */

export const SMTP_EMAIL_CODE = 'smtp';

export type SmtpConfig = {
  host: string;
  port: number;
  /** TLS from the first byte (usually port 465). STARTTLS otherwise. */
  secure: boolean;
  /** Some relays authenticate by IP; user/password are optional. */
  user?: string;
  password?: string;
  from: string;
};

export class SmtpEmailSender implements EmailSender {
  readonly code = SMTP_EMAIL_CODE;

  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.password
          ? { user: config.user, pass: config.password }
          : undefined,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return {
        delivered: true,
        providerMessageId: info.messageId ?? null,
      };
    } catch (error) {
      return {
        delivered: false,
        providerMessageId: null,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
