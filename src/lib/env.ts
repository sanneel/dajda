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
     * payment merchant account. It relaxes exactly three checks - the payment
     * provider, the mock webhook secret and the email provider - and nothing
     * else. It is an explicit opt-in rather than a fallback, so nobody
     * arrives here by forgetting a variable.
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

    /**
     * The analyst's percentage of a subscriber's payment. The remainder is
     * the platform's commission. Whatever is set here must match the figure
     * in the signed agreement (docs/legal/agreement.md, clause 5.3), because
     * that document is what the analyst is owed by.
     */
    ANALYST_SHARE_PERCENT: z.coerce.number().int().min(0).max(100).default(85),

    /** Smallest withdrawal, in tetri. Below this a payout costs more in fees
     *  than it moves, so the balance rolls into the next period. */
    ANALYST_MIN_PAYOUT_MINOR: z.coerce.number().int().min(1).default(2000),

    /**
     * Publications an analyst must have in EVERY whole week of the period for
     * the activity check to pass. Weekly rather than monthly because a
     * subscriber pays for a month of analysis and receives it as the month
     * goes: a monthly total cannot tell steady delivery apart from a burst at
     * the end.
     *
     * A failing check does not block the request. It is surfaced to the
     * administrator who releases the payout, which is what the agreement
     * describes (clause 5.6).
     */
    ANALYST_MIN_PUBLICATIONS_PER_WEEK: z.coerce
      .number()
      .int()
      .min(0)
      .default(10),

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

    /**
     * BotFather token, `<numeric id>:<secret>`. Optional: without it the
     * "log in with Telegram" button simply does not render, so a deployment
     * that has not registered a bot loses nothing. The bot must also have its
     * domain set via BotFather /setdomain to the APP_URL host, or Telegram
     * refuses to redirect back.
     */
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[\w-]+$/, 'TELEGRAM_BOT_TOKEN must look like "123456:secret"')
      .optional(),

    /**
     * The bot's @name, without the @. Needed for the `t.me/<name>?start=...`
     * deep link, which the token alone cannot supply - it carries the bot's
     * numeric id, and t.me addresses bots by username.
     */
    TELEGRAM_BOT_USERNAME: z
      .string()
      .regex(
        /^[A-Za-z0-9_]{5,32}$/,
        'TELEGRAM_BOT_USERNAME must be the bot name without the @',
      )
      .optional(),

    /**
     * Shared secret echoed by Telegram in the X-Telegram-Bot-Api-Secret-Token
     * header of every webhook call. Set it when registering the webhook; the
     * endpoint refuses any request that does not carry it, which is what stops
     * anyone who guesses the URL from forging "this chat is user X".
     */
    TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),

    /**
     * Where email goes. "log" prints to the server console and sends nothing,
     * which is the default because the default must not be able to reach a
     * real person: a laptop running seeded demo accounts would otherwise mail
     * addresses nobody owns the first time a button is pressed.
     *
     * The two real adapters are HTTP APIs with free tiers. Either way the
     * sending domain needs SPF and DKIM records set up with the provider, or
     * the mail is filed as spam no matter what this app does.
     */
    EMAIL_PROVIDER: z.enum(['log', 'resend', 'brevo']).default('log'),
    EMAIL_API_KEY: z.string().min(1).optional(),
    /** RFC form: `DAJDA <no-reply@dajda.ge>`, or a bare address. */
    EMAIL_FROM: z.string().min(3).optional(),

    /**
     * Bearer secret for the outbox sweep endpoint. Unset means the endpoint
     * refuses everyone, which is the right default: a queue drained by
     * anybody who finds the URL is a way to make the app send its backlog on
     * demand.
     */
    CRON_SECRET: z.string().min(16).optional(),
  })
  .superRefine((value, ctx) => {
    /*
     * Telegram comes in two steps and either is legitimate on its own terms:
     * the token alone enables "log in with Telegram", and the username plus
     * the webhook secret add bot messaging on top. What is never legitimate is
     * naming a bot we have no token for - the deep link would open a chat that
     * can never answer.
     */
    if (value.TELEGRAM_BOT_USERNAME && !value.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message:
          'TELEGRAM_BOT_USERNAME is set without TELEGRAM_BOT_TOKEN: the bot link would open a chat nothing can reply to.',
      });
    }

    /*
     * A real email provider needs both a key and a From address. Missing
     * either means every send fails at the provider, which looks from the
     * outside like mail that silently never arrives - the worst way for this
     * to be misconfigured.
     */
    if (value.EMAIL_PROVIDER !== 'log') {
      for (const key of ['EMAIL_API_KEY', 'EMAIL_FROM'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER="${value.EMAIL_PROVIDER}"`,
          });
        }
      }
    }

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
     * DEMO_MODE waives the two PAYMENT checks, the EMAIL check, and only
     * those.
     *
     * The reasoning is that the payment checks protect real money and the
     * email check protects real recipients, and a demo has neither: the mock
     * provider hands out subscriptions that buy access to seeded content,
     * forging its webhook grants the same thing the built-in /dev/checkout
     * simulator already grants anyone who visits it, and demo mail goes to
     * invented addresses. Requiring a secret to protect an unlocked door is
     * theatre.
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

      /*
       * The log provider prints mail instead of delivering it. Registration
       * and password reset promise the visitor an email, so a production
       * deployment that only logs them is broken in a way nobody notices
       * until a customer is locked out. A demo, by contrast, has no real
       * recipients - so the waiver above extends to this check.
       */
      if (value.EMAIL_PROVIDER === 'log') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_PROVIDER'],
          message:
            'EMAIL_PROVIDER="log" only logs email and must not be used in production. Configure resend or brevo, or set DEMO_MODE="true" to run an openly-labelled demo.',
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
