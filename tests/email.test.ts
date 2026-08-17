import { describe, expect, it, vi } from 'vitest';
import { ConsoleEmailSender } from '@/lib/email/console';
import {
  notificationEmail,
  passwordResetEmail,
  verificationEmail,
} from '@/lib/email/templates';
import {
  dispatchPendingEmails,
  type DispatchPort,
  type PendingEmailRow,
} from '@/lib/notifications/dispatcher';
import type { EmailMessage, EmailSender } from '@/lib/email/types';

describe('email templates', () => {
  it('puts the verification link in the body verbatim', () => {
    const link = 'https://dajda.ge/verify-email?token=abc123';
    const content = verificationEmail(link);

    expect(content.text).toContain(link);
    expect(content.subject).toContain('დაადასტურეთ');
  });

  it('puts the reset link in the body verbatim', () => {
    const link = 'https://dajda.ge/reset-password?token=abc123';
    const content = passwordResetEmail(link);

    expect(content.text).toContain(link);
    // The one promise a reset mail must make: ignoring it changes nothing.
    expect(content.text).toContain('პაროლი უცვლელი რჩება');
  });

  it('renders a notification with and without a link', () => {
    const withLink = notificationEmail('სათაური', 'ტექსტი', 'https://dajda.ge/x');
    expect(withLink.subject).toContain('სათაური');
    expect(withLink.text).toContain('https://dajda.ge/x');

    const withoutLink = notificationEmail('სათაური', 'ტექსტი', null);
    expect(withoutLink.text).not.toContain('https://');
  });
});

describe('console sender', () => {
  it('logs the message and reports it delivered', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const outcome = await new ConsoleEmailSender().send({
      to: 'user@example.com',
      subject: 'Test',
      text: 'body line',
    });

    expect(outcome.delivered).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]?.[0])).toContain('user@example.com');
  });
});

/** In-memory outbox + a scriptable sender. */
function makeDispatchFixture(
  rows: PendingEmailRow[],
  failFor: Set<string> = new Set(),
) {
  const sentMessages: EmailMessage[] = [];
  const state = new Map(
    rows.map((row) => [row.id, { row, status: 'PENDING', reason: '' }]),
  );

  const port: DispatchPort = {
    async findPendingEmails(limit) {
      return [...state.values()]
        .filter((entry) => entry.status === 'PENDING')
        .slice(0, limit)
        .map((entry) => entry.row);
    },
    async markSent(id) {
      const entry = state.get(id);
      if (entry) entry.status = 'SENT';
    },
    async markFailed(id, reason) {
      const entry = state.get(id);
      if (entry) {
        entry.status = 'FAILED';
        entry.reason = reason;
      }
    },
  };

  const sender: EmailSender = {
    code: 'fake',
    async send(message) {
      if (failFor.has(message.to)) {
        return {
          delivered: false,
          providerMessageId: null,
          detail: 'mailbox unavailable',
        };
      }
      sentMessages.push(message);
      return { delivered: true, providerMessageId: 'msg-1' };
    },
  };

  return { port, sender, sentMessages, state };
}

function row(id: string, overrides: Partial<PendingEmailRow> = {}): PendingEmailRow {
  return {
    id,
    destination: `${id}@example.com`,
    subjectKa: 'ახალი ბეთი',
    bodyKa: 'ავტორმა დადო ახალი ბეთი.',
    linkPath: '/analysts/vano',
    ...overrides,
  };
}

describe('outbox dispatch', () => {
  it('sends each pending row and marks it SENT', async () => {
    const { port, sender, sentMessages, state } = makeDispatchFixture([
      row('a'),
      row('b'),
    ]);

    const outcome = await dispatchPendingEmails(
      port,
      sender,
      'https://dajda.ge',
    );

    expect(outcome).toEqual({ sent: 2, failed: 0, remaining: false });
    expect(state.get('a')?.status).toBe('SENT');
    // The relative linkPath became an absolute link.
    expect(sentMessages[0]?.text).toContain('https://dajda.ge/analysts/vano');
  });

  it('marks a failed delivery FAILED with the transport detail', async () => {
    const { port, sender, state } = makeDispatchFixture(
      [row('a'), row('b')],
      new Set(['a@example.com']),
    );

    const outcome = await dispatchPendingEmails(
      port,
      sender,
      'https://dajda.ge',
    );

    expect(outcome.sent).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(state.get('a')?.status).toBe('FAILED');
    expect(state.get('a')?.reason).toBe('mailbox unavailable');
    // One bad mailbox never blocks the rest of the queue.
    expect(state.get('b')?.status).toBe('SENT');
  });

  it('fails a row with no stored destination instead of wedging', async () => {
    const { port, sender, state } = makeDispatchFixture([
      row('a', { destination: null }),
    ]);

    const outcome = await dispatchPendingEmails(
      port,
      sender,
      'https://dajda.ge',
    );

    expect(outcome.failed).toBe(1);
    expect(state.get('a')?.status).toBe('FAILED');
  });

  it('reports when more work remains beyond the batch', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`row-${i}`));
    const { port, sender } = makeDispatchFixture(rows);

    const outcome = await dispatchPendingEmails(
      port,
      sender,
      'https://dajda.ge',
      3,
    );

    expect(outcome.sent).toBe(3);
    expect(outcome.remaining).toBe(true);
  });
});
