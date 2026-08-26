/**
 * Email provider abstraction.
 *
 * Deliberately HTTP-only. Every provider worth using offers a JSON send
 * endpoint, and speaking SMTP would mean adding a mail library plus a
 * long-lived socket to an app that otherwise makes short request-scoped calls.
 * The adapters below are each about thirty lines of `fetch`.
 *
 * Messages are plain text. A bet notice is four lines of Georgian prose and a
 * link; wrapping it in HTML would add a template to maintain, a second copy of
 * every string, and the spam-filter penalty that image-and-table mail carries,
 * in exchange for nothing the reader wants.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailSendResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      /**
       * True when retrying cannot help: the address is malformed, rejected, or
       * the credentials are wrong in a way a retry will not fix.
       */
      permanent: boolean;
    };

export interface EmailProvider {
  readonly code: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Which HTTP statuses are worth trying again.
 *
 * 4xx means the provider understood and refused - a bad address, a rejected
 * key, a body it will never accept - so repeating it just burns quota. The one
 * exception is 429: that IS a "try later", said explicitly. 5xx is their
 * problem and usually temporary.
 */
export function isPermanentStatus(status: number): boolean {
  if (status === 429) return false;
  return status >= 400 && status < 500;
}
