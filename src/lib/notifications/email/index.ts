import { getEnv } from '@/lib/env';
import { BrevoEmailProvider } from './brevo';
import { LogEmailProvider } from './log';
import { ResendEmailProvider } from './resend';
import type { EmailProvider } from './types';

export * from './types';
export { LOG_PROVIDER_CODE } from './log';
export { RESEND_PROVIDER_CODE } from './resend';
export { BREVO_PROVIDER_CODE } from './brevo';

let cached: EmailProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * Switching is a single environment variable and no call site knows which one
 * it is talking to, exactly as with payments. The default is the one that
 * cannot reach a real mailbox.
 */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();

  if (env.EMAIL_PROVIDER === 'resend') {
    cached = new ResendEmailProvider({
      // Presence is guaranteed by the env schema's superRefine.
      apiKey: env.EMAIL_API_KEY as string,
      from: env.EMAIL_FROM as string,
    });
  } else if (env.EMAIL_PROVIDER === 'brevo') {
    cached = new BrevoEmailProvider({
      apiKey: env.EMAIL_API_KEY as string,
      from: env.EMAIL_FROM as string,
    });
  } else {
    cached = new LogEmailProvider();
  }

  return cached;
}

/** Test/dev helper - forget the memoised provider after changing env. */
export function resetEmailProviderCache(): void {
  cached = null;
}
