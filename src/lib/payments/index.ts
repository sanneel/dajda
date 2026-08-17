import { getEnv } from '@/lib/env';
import { FlittPaymentProvider } from './flitt';
import { MockPaymentProvider } from './mock';
import type { PaymentProvider } from './types';

export * from './types';
export { MOCK_PROVIDER_CODE } from './mock';
export { FLITT_PROVIDER_CODE } from './flitt';

let cached: PaymentProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * Switching providers is a single environment variable; no call site knows
 * which one it is talking to.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const env = getEnv();

  if (env.PAYMENT_PROVIDER === 'flitt') {
    cached = new FlittPaymentProvider({
      // Presence is guaranteed by the env schema's superRefine.
      merchantId: env.FLITT_MERCHANT_ID as string,
      secretKey: env.FLITT_SECRET_KEY as string,
      webhookSecret: env.FLITT_WEBHOOK_SECRET ?? (env.FLITT_SECRET_KEY as string),
      creditKey: env.FLITT_CREDIT_KEY,
      apiUrl: env.FLITT_API_URL,
    });
  } else {
    cached = new MockPaymentProvider({
      secret: env.MOCK_PAYMENT_SECRET,
      appUrl: env.APP_URL,
    });
  }

  return cached;
}

/** Test/dev helper - forget the memoised provider after changing env. */
export function resetPaymentProviderCache(): void {
  cached = null;
}
