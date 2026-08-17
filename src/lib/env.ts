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

    /**
     * Run a public deployment as an openly-labelled demo.
     *
     * This exists so the app can be shown to somebody before there is a
     * payment merchant account. It relaxes exactly two checks - the payment
     * provider and the mock webhook secret - and nothing else. It is an
     * explicit opt-in rather than a fallback, so nobody arrives here by
     * forgetting a variable.
     *
     * Every page renders a banner while it is on. A deployment that takes real
     * money must never be indistinguishable from one that does not, and the
     * only way to keep that true is to make the state visible rather than
     * documented.
     */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    FLITT_MERCHANT_ID: z.string().optional(),
    FLITT_SECRET_KEY: z.string().optional(),
    FLITT_WEBHOOK_SECRET: z.string().optional(),
    /**
     * Separate private key Flitt issues for payout (P2P card credit)
     * operations. Optional: without it every payout attempt is refused at
     * the adapter, while checkout and subscriptions keep working.
     */
    FLITT_CREDIT_KEY: z.string().optional(),
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

    /*
     * DEMO_MODE waives the two PAYMENT checks and only those.
     *
     * The reasoning is that both of them protect real money, and a demo has
     * none: the mock provider hands out subscriptions that buy access to
     * seeded content, and forging its webhook grants the same thing the
     * built-in /dev/checkout simulator already grants anyone who visits it.
     * Requiring a secret to protect an unlocked door is theatre.
     *
     * The APP_URL check below is NOT waived, because it protects the session
     * cookie of every visitor including the demo's, and costs nothing to
     * satisfy: a host that can serve the demo can serve it over https.
     */
    if (!value.DEMO_MODE) {
      // The mock provider ships a signed-webhook simulator and a checkout
      // stand-in at /dev/checkout, both gated on this value. Left at its
      // default, a deployment hands out paid subscriptions to anyone.
      if (value.PAYMENT_PROVIDER === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_PROVIDER'],
          message:
            'PAYMENT_PROVIDER="mock" enables the development payment simulator and must not be used in production. Set PAYMENT_PROVIDER="flitt", or DEMO_MODE="true" to run an openly-labelled demo.',
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
    }

    /*
     * A demo must not be able to take real money. If it could, "demo" would be
     * a label on the page rather than a property of the deployment, and the
     * banner would be a claim instead of a fact.
     */
    if (value.DEMO_MODE && value.PAYMENT_PROVIDER === 'flitt') {
      ctx.addIssue({
        code: 'custom',
        path: ['DEMO_MODE'],
        message:
          'DEMO_MODE="true" cannot be combined with PAYMENT_PROVIDER="flitt": a demo must not reach a live payment merchant.',
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
