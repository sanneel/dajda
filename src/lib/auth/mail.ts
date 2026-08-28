import { getEmailProvider } from '@/lib/notifications/email';
import { renderEmailHtml } from '@/lib/notifications/email/template';
import { getEnv } from '@/lib/env';

/**
 * The two transactional mails the auth flow sends.
 *
 * Sent directly through the configured provider rather than through the
 * notification outbox on purpose: a verification link is the answer to a
 * request the person just made, so queueing it behind a cron sweep would
 * add minutes of latency to the one mail somebody is actively waiting for.
 * The outbox stays what it is - fan-out nobody is refreshing a page about.
 *
 * Templates are pure functions over fully-resolved values so a test can
 * snapshot them without touching env or the network.
 */

export type AuthMailContent = {
  subject: string;
  text: string;
  /** Styled twin of `text`, from the shared template. Same words, same link. */
  html: string;
};

const SIGNATURE = 'DAJDA · dajda.ge';

export function verificationEmail(link: string): AuthMailContent {
  const opening =
    'ამ მისამართით DAJDA-ზე ანგარიშის რეგისტრაცია მოხდა. დასადასტურებლად დააჭირეთ ღილაკს:';
  const expiry =
    'ბმული მოქმედებს 24 საათი. თუ ეს თქვენ არ ყოფილხართ, უბრალოდ არ მიაქციოთ წერილს ყურადღება.';
  return {
    subject: 'DAJDA: დაადასტურეთ ელფოსტა',
    text: [
      'გამარჯობა,',
      '',
      opening,
      '',
      link,
      '',
      expiry,
      '',
      SIGNATURE,
    ].join('\n'),
    html: renderEmailHtml({
      heading: 'ელფოსტის დადასტურება',
      paragraphs: [opening],
      cta: { label: 'ელფოსტის დადასტურება', url: link },
      footerLines: [expiry],
    }),
  };
}

export function passwordResetEmail(link: string): AuthMailContent {
  const opening =
    'მოთხოვნილია პაროლის აღდგენა. ახალი პაროლის დასაყენებლად დააჭირეთ ღილაკს:';
  const expiry =
    'ბმული მოქმედებს 1 საათი. თუ პაროლის აღდგენა თქვენ არ მოგითხოვიათ, წერილი უგულებელყავით, პაროლი უცვლელი რჩება.';
  return {
    subject: 'DAJDA: პაროლის აღდგენა',
    text: [
      'გამარჯობა,',
      '',
      opening,
      '',
      link,
      '',
      expiry,
      '',
      SIGNATURE,
    ].join('\n'),
    html: renderEmailHtml({
      heading: 'პაროლის აღდგენა',
      paragraphs: [opening],
      cta: { label: 'ახალი პაროლის დაყენება', url: link },
      footerLines: [expiry],
    }),
  };
}

/**
 * Deliver the verification link. Failure is logged, never thrown: an account
 * must not fail to exist because a mail provider hiccuped - the dashboard
 * offers a resend for exactly that case.
 */
export async function sendVerificationEmail(
  email: string,
  rawToken: string,
): Promise<void> {
  const env = getEnv();
  const content = verificationEmail(
    `${env.APP_URL}/verify-email?token=${rawToken}`,
  );
  const outcome = await getEmailProvider().send({
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  if (!outcome.ok) {
    console.error(
      `[dajda] verification email to ${email} failed: ${outcome.reason}`,
    );
  }
}

/**
 * The verification link, but only when nothing is actually sending mail.
 *
 * With EMAIL_PROVIDER=log the message goes to the server console, which a
 * person testing a deployment cannot read. Rather than leave registration
 * untestable until a mail provider and its DNS records exist, the link is
 * handed back to the signed-in owner of the address so they can finish the
 * flow themselves.
 *
 * Safe by construction on two counts: the caller has already resolved the
 * actor from the session, so this only ever reaches the account the token
 * belongs to; and `log` is refused outright with NODE_ENV=production unless
 * the deployment is a labelled demo, so it cannot appear on a live site.
 */
export function verificationLinkWhenUnsent(rawToken: string): string | null {
  const env = getEnv();
  if (env.EMAIL_PROVIDER !== 'log') return null;
  return `${env.APP_URL}/verify-email?token=${rawToken}`;
}

/** Deliver the reset link, with the same never-throw contract. */
export async function sendPasswordResetEmail(
  email: string,
  rawToken: string,
): Promise<void> {
  const env = getEnv();
  const content = passwordResetEmail(
    `${env.APP_URL}/reset-password?token=${rawToken}`,
  );
  const outcome = await getEmailProvider().send({
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  if (!outcome.ok) {
    console.error(`[dajda] password reset email failed: ${outcome.reason}`);
  }
}
