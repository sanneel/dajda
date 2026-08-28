import {
  isPermanentStatus,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from './types';

export const RESEND_PROVIDER_CODE = 'resend';

/**
 * Resend, over its HTTP API.
 *
 * Chosen as one of the two built-in adapters because its free tier is
 * generous enough for a product this size and the API is a single POST. The
 * sending domain still has to be verified in their dashboard (SPF and DKIM
 * records on the domain) - without that, mail is either refused outright or
 * filed as spam, and no amount of code here changes it.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly code = RESEND_PROVIDER_CODE;

  constructor(
    private readonly config: { apiKey: string; from: string },
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
    } catch (error) {
      // Network-level failure: their end or ours, either way worth retrying.
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'network error',
        permanent: false,
      };
    }

    if (response.ok) return { ok: true };

    const body = await response.text().catch(() => '');
    return {
      ok: false,
      reason: `${response.status} ${body.slice(0, 200)}`,
      permanent: isPermanentStatus(response.status),
    };
  }
}
