import { z } from 'zod';

/**
 * Server-side environment. Never import this from a client component - it
 * would pull secrets into the browser bundle.
 *
 * Parsing is lazy and memoised so that importing a module which happens to
 * touch env does not crash tooling that runs without a full environment.
 */
/*
 * Defaults that are fine locally and dangerous in production. Named so the
 * production guard below can recognise "still unset" rather than duplicating
 * the literals.
 */
const DEFAULT_MOCK_SECRET = 'dev-mock-secret';
const DEFAULT_APP_URL = 'http://localhost:3000';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL აუცილებელია'),
    /**
     * Optional cap on the connection pool. Left unset in production so the pg
     * driver's default applies; set to 1 when running against the single
     * connection dev server in scripts/dev-db.mjs.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
    AUTH_SECRET: z
      .string()
      .min(32, 'AUTH_SECRET უნდა იყოს მინიმუმ 32 სიმბოლო'),
    APP_URL: z.url().default(DEFAULT_APP_URL),

    PAYMENT_PROVIDER: z.enum(['mock', 'flitt']).default('mock'),
    MOCK_PAYMENT_SECRET: z.string().min(1).default(DEFAULT_MOCK_SECRET),

    FLITT_MERCHANT_ID: z.string().optional(),
    FLITT_SECRET_KEY: z.string().optional(),
    FLITT_WEBHOOK_SECRET: z.string().optional(),
    FLITT_API_URL: z.url().default('https://pay.flitt.com'),
  })
  .superRefine((value, ctx) => {
    // Fail fast at boot rather than at the first customer checkout.
    if (value.PAYMENT_PROVIDER === 'flitt') {
      for (const key of ['FLITT_MERCHANT_ID', 'FLITT_SECRET_KEY'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when PAYMENT_PROVIDER="flitt"`,
          });
        }
      }
    }

    if (value.NODE_ENV !== 'production') return;

    /*
     * `next build` runs with NODE_ENV=production and collects page data, which
     * imports this module. A build machine legitimately has no production
     * secrets - requiring them would mean nobody could compile the app without
     * the live credentials, which is both impractical and worse for security
     * than the problem being solved. The guard protects a *running* deployment,
     * so it is skipped for the build phase only.
     */
    if (process.env.NEXT_PHASE === 'phase-production-build') return;

    /*
     * Production must be configured explicitly. Every default below is safe
     * for a laptop and unsafe on a public host, and the failure mode of each
     * is silent - the app boots and looks fine while being wrong. Refusing to
     * start is the only honest behaviour.
     */

    // The mock provider ships a signed-webhook simulator and a checkout stand-in
    // at /dev/checkout, both gated on this value. Left at its default, a
    // deployment hands out paid subscriptions to anyone who asks.
    if (value.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message:
          'PAYMENT_PROVIDER="mock" enables the development payment simulator and must not be used in production. Set PAYMENT_PROVIDER="flitt".',
      });
    }

    // Documented in .env.example, so treat it as public knowledge: anyone
    // could forge a webhook and activate a subscription.
    if (value.MOCK_PAYMENT_SECRET === DEFAULT_MOCK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['MOCK_PAYMENT_SECRET'],
        message:
          'MOCK_PAYMENT_SECRET is still the shared development default and is publicly known.',
      });
    }

    // APP_URL is not cosmetic: the session cookie's Secure flag is derived
    // from its scheme, and payment return URLs are built from it. Left at the
    // default, production issues session cookies without Secure and sends
    // customers back to localhost after paying.
    if (value.APP_URL === DEFAULT_APP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message:
          'APP_URL is still http://localhost:3000. Set it to the public https:// origin. The session cookie Secure flag and payment return URLs depend on it.',
      });
    } else if (!value.APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message:
          'APP_URL must use https:// in production, otherwise the session cookie is issued without the Secure flag.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoised copy after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}
