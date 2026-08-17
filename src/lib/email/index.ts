import { getEnv } from '@/lib/env';
import { ConsoleEmailSender } from './console';
import { SmtpEmailSender } from './smtp';
import type { EmailSender } from './types';

export * from './types';
export * from './templates';
export { CONSOLE_EMAIL_CODE } from './console';
export { SMTP_EMAIL_CODE } from './smtp';

let cached: EmailSender | null = null;

/** Resolve the configured sender, exactly like getPaymentProvider(). */
export function getEmailSender(): EmailSender {
  if (cached) return cached;
  const env = getEnv();

  if (env.EMAIL_PROVIDER === 'smtp') {
    cached = new SmtpEmailSender({
      // Presence is guaranteed by the env schema's superRefine.
      host: env.SMTP_HOST as string,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    });
  } else {
    cached = new ConsoleEmailSender();
  }

  return cached;
}

/** Test/dev helper - forget the memoised sender after changing env. */
export function resetEmailSenderCache(): void {
  cached = null;
}
