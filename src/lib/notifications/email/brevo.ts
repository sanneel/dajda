import {
  isPermanentStatus,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from './types';

export const BREVO_PROVIDER_CODE = 'brevo';

/**
 * Brevo, over its transactional API.
 *
 * The second built-in adapter, and the one to reach for when the daily
 * allowance matters more than the monthly one - the two free tiers are shaped
 * differently, so which is "more free" depends on whether the traffic is
 * steady or bursty. As with Resend, the sending domain needs its SPF and DKIM
 * records set up on their side before anything lands in an inbox.
 *
 * Brevo wants the sender split into name and address rather than one RFC
 * string, so an `EMAIL_FROM` of "DAJDA <no-reply@dajda.ge>" is parsed here.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly code = BREVO_PROVIDER_CODE;

  constructor(
    private readonly config: { apiKey: string; from: string },
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const sender = parseSender(this.config.from);

    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.config.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
        }),
      });
    } catch (error) {
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

/** `"DAJDA <no-reply@dajda.ge>"` -> `{ name, email }`; a bare address works too. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: from.trim() };

  const name = match[1]?.replace(/^"|"$/g, '').trim();
  return {
    ...(name ? { name } : {}),
    email: (match[2] ?? '').trim(),
  };
}
