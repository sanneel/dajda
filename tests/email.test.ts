import { describe, expect, it } from 'vitest';
import { isPermanentStatus } from '@/lib/notifications/email/types';
import { parseSender } from '@/lib/notifications/email/brevo';

/**
 * The two decisions in the email path that are not "call fetch": whether a
 * failure is worth retrying, and how a From address is split for providers
 * that want it in pieces. Both are pure, so both are pinned down here.
 */
describe('retry classification', () => {
  it('does not retry a refusal', () => {
    // The provider understood and said no; repeating it only burns quota.
    expect(isPermanentStatus(400)).toBe(true);
    expect(isPermanentStatus(401)).toBe(true);
    expect(isPermanentStatus(403)).toBe(true);
    expect(isPermanentStatus(422)).toBe(true);
  });

  it('retries rate limiting, which is an explicit "try later"', () => {
    expect(isPermanentStatus(429)).toBe(false);
  });

  it('retries provider-side failures', () => {
    expect(isPermanentStatus(500)).toBe(false);
    expect(isPermanentStatus(502)).toBe(false);
    expect(isPermanentStatus(503)).toBe(false);
  });
});

describe('sender parsing', () => {
  it('splits a named address', () => {
    expect(parseSender('DAJDA <no-reply@dajda.ge>')).toEqual({
      name: 'DAJDA',
      email: 'no-reply@dajda.ge',
    });
  });

  it('accepts a bare address', () => {
    expect(parseSender('no-reply@dajda.ge')).toEqual({
      email: 'no-reply@dajda.ge',
    });
  });

  it('strips quotes and surrounding space from the display name', () => {
    expect(parseSender('  "DAJDA ანალიზი"  <no-reply@dajda.ge> ')).toEqual({
      name: 'DAJDA ანალიზი',
      email: 'no-reply@dajda.ge',
    });
  });

  it('omits the name rather than sending an empty one', () => {
    // Brevo rejects a sender whose name is present but blank.
    expect(parseSender('<no-reply@dajda.ge>')).toEqual({
      email: 'no-reply@dajda.ge',
    });
  });
});

describe('auth mail templates', () => {
  it('puts the verification link in the body verbatim', async () => {
    const { verificationEmail } = await import('@/lib/auth/mail');
    const link = 'https://dajda.ge/verify-email?token=abc123';
    const content = verificationEmail(link, '123456');

    expect(content.text).toContain(link);
    // The code rides in the subject so a lock-screen notification shows it
    // and the OS autofill scanners can lift it.
    expect(content.subject).toContain('123456');
    expect(content.subject).toContain('კოდი');
  });

  it('puts the reset link in the body and promises inaction is safe', async () => {
    const { passwordResetEmail } = await import('@/lib/auth/mail');
    const link = 'https://dajda.ge/reset-password?token=abc123';
    const content = passwordResetEmail(link);

    expect(content.text).toContain(link);
    // The one promise a reset mail must make: ignoring it changes nothing.
    expect(content.text).toContain('პაროლი უცვლელი რჩება');
  });
});

describe('email HTML template', () => {
  it('escapes user-controlled text', async () => {
    const { renderEmailHtml } = await import(
      '@/lib/notifications/email/template'
    );
    const html = renderEmailHtml({
      heading: 'x',
      paragraphs: ['<script>alert(1)</script>'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('repeats the CTA link as copyable text, not only as a button', async () => {
    const { renderEmailHtml } = await import(
      '@/lib/notifications/email/template'
    );
    const url = 'https://dajda.ge/verify-email?token=abc';
    const html = renderEmailHtml({
      heading: 'x',
      paragraphs: ['y'],
      cta: { label: 'ღილაკი', url },
    });
    // Twice: once as the button's href, once as visible copyable text.
    expect(html.split(url).length - 1).toBeGreaterThanOrEqual(2);
  });

  it('auth mails carry the same link in text and html', async () => {
    const { verificationEmail } = await import('@/lib/auth/mail');
    const link = 'https://dajda.ge/verify-email?token=abc123';
    const content = verificationEmail(link, '123456');
    expect(content.text).toContain(link);
    expect(content.html).toContain(link);
    // The html part never replaces the text part.
    expect(content.text.length).toBeGreaterThan(0);
  });
});

describe('verification code', () => {
  it('shows the code in both parts of the mail', async () => {
    const { verificationEmail } = await import('@/lib/auth/mail');
    const content = verificationEmail('https://dajda.ge/verify-email?token=x', '042317');
    expect(content.text).toContain('042317');
    expect(content.html).toContain('042317');
  });

  it('keeps leading zeros', async () => {
    const { generateVerificationCode } = await import('@/lib/auth/tokens');
    for (let i = 0; i < 200; i += 1) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('salts the code hash with the user id', async () => {
    const { hashCodeForUser } = await import('@/lib/auth/tokens');
    // Same code, two users: different hashes, or the unique column collides.
    expect(hashCodeForUser('user-a', '123456')).not.toBe(
      hashCodeForUser('user-b', '123456'),
    );
  });
});
