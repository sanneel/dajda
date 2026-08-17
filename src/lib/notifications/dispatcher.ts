import { notificationEmail } from '@/lib/email/templates';
import type { EmailSender } from '@/lib/email/types';

/**
 * The sending half of the outbox (see outbox.ts for the queueing half).
 *
 * A dispatch run drains a batch of PENDING email rows through the configured
 * sender and records the outcome on each row. It is driven from the outside -
 * an external cron hitting /api/notifications/dispatch - because a request
 * handler that fans out to hundreds of SMTP calls would tie its fate to one
 * visitor's request.
 *
 * Delivery is at-least-once, resolved per row: a crash between "sent" and
 * "marked SENT" re-sends one message on the next run. The alternative -
 * marking first - silently loses mail on the same crash, and a duplicate
 * notice is a nuisance while a lost one is a broken promise.
 *
 * Telegram rows stay PENDING untouched; that integration still does not
 * exist, and this function must not quietly mark its backlog FAILED.
 */

export type PendingEmailRow = {
  id: string;
  destination: string | null;
  subjectKa: string;
  bodyKa: string;
  linkPath: string | null;
};

export interface DispatchPort {
  /** The oldest PENDING email rows, capped at `limit`. */
  findPendingEmails(limit: number): Promise<PendingEmailRow[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export type DispatchOutcome = {
  sent: number;
  failed: number;
  remaining: boolean;
};

export async function dispatchPendingEmails(
  port: DispatchPort,
  sender: EmailSender,
  appUrl: string,
  limit = 25,
): Promise<DispatchOutcome> {
  const rows = await port.findPendingEmails(limit + 1);
  const batch = rows.slice(0, limit);

  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    // The outbox only writes email rows with an address, but the invariant
    // is enforced here too - a row must never wedge the queue.
    if (!row.destination) {
      await port.markFailed(row.id, 'მისამართი არ არის შენახული.');
      failed += 1;
      continue;
    }

    const content = notificationEmail(
      row.subjectKa,
      row.bodyKa,
      row.linkPath ? `${appUrl}${row.linkPath}` : null,
    );

    const outcome = await sender.send({
      to: row.destination,
      subject: content.subject,
      text: content.text,
    });

    if (outcome.delivered) {
      await port.markSent(row.id);
      sent += 1;
    } else {
      await port.markFailed(row.id, outcome.detail ?? 'გაგზავნა ვერ მოხერხდა.');
      failed += 1;
    }
  }

  return { sent, failed, remaining: rows.length > batch.length };
}
