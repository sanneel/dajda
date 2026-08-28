import { getEmailProvider } from '@/lib/notifications/email';
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
};

const SIGNATURE = 'DAJDA · dajda.ge';

export function verificationEmail(link: string): AuthMailContent {
  return {
    subject: 'DAJDA: დაადასტურეთ ელფოსტა',
    text: [
      'გამარჯობა,',
      '',
      'ამ მისამართით DAJDA-ზე ანგარიშის რეგისტრაცია მოხდა. დასადასტურებლად გადადით ბმულზე:',
      '',
      link,
      '',
      'ბმული მოქმედებს 24 საათი. თუ ეს თქვენ არ ყოფილხართ, უბრალოდ არ მიაქციოთ წერილს ყურადღება.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

export function passwordResetEmail(link: string): AuthMailContent {
  return {
    subject: 'DAJDA: პაროლის აღდგენა',
    text: [
      'გამარჯობა,',
      '',
      'მოთხოვნილია პაროლის აღდგენა. ახალი პაროლის დასაყენებლად გადადით ბმულზე:',
      '',
      link,
      '',
      'ბმული მოქმედებს 1 საათი. თუ პაროლის აღდგენა თქვენ არ მოგითხოვიათ, წერილი უგულებელყავით, პაროლი უცვლელი რჩება.',
      '',
      SIGNATURE,
    ].join('\n'),
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
  });
  if (!outcome.ok) {
    console.error(
      `[dajda] verification email to ${email} failed: ${outcome.reason}`,
    );
  }
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
  });
  if (!outcome.ok) {
    console.error(`[dajda] password reset email failed: ${outcome.reason}`);
  }
}
