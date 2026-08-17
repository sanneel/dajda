/**
 * Email delivery abstraction, shaped like the payment provider abstraction:
 * call sites depend on the interface, and which transport is behind it is a
 * single environment variable.
 *
 * Messages are plain text on purpose. Every mail this app sends is a short
 * notice with one link; text renders everywhere, survives aggressive spam
 * filtering better than markup, and leaves nothing to get out of sync with
 * a design system.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailSendResult = {
  delivered: boolean;
  /** The transport's own id for the accepted message, when it reports one. */
  providerMessageId: string | null;
  /** Present when delivery failed; safe to store, never shown to visitors. */
  detail?: string;
};

export interface EmailSender {
  readonly code: string;
  /**
   * Deliver one message. Never throws: a failed delivery is a result, not an
   * exception, so a caller like registration can proceed and the outbox can
   * record the failure without try/catch at every call site.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;
}
