# DAJDA

**ნახე ვინ დადო სწორად.** - სპორტული ფსონები, რეალური შედეგებით.

DAJDA (dajda.ge) is a Georgian-language platform that sells access to **written
sports analysis** and publishes a **transparent, tamper-evident performance
record** for every author - wins, losses and pending alike.

> **DAJDA is not a bookmaker.** It accepts no wagers, holds no user funds, pays
> no winnings, and places no bets on anyone's behalf. There is no wallet, no
> balance and no bet slip anywhere in the schema - deliberately. Money enters
> the system only as a subscription fee for content. "Units" are a bookkeeping
> measure of an author's published record, not a currency and not redeemable.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Actions) |
| Language | TypeScript 5.9, `strict` + `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens) |
| Database | PostgreSQL 17 + Prisma 7 (`prisma-client` generator, `pg` driver adapter) |
| Validation | Zod 4 |
| Auth | First-party: `node:crypto` scrypt + revocable DB-backed sessions |
| Icons | lucide-react |
| Charts | Hand-written inline SVG - no charting dependency |
| Tests | Vitest (database-free) |

Auth is deliberately **not** Auth.js. See [Design decisions](#design-decisions).

---

## Quick start

```bash
npm install
cp .env.example .env
```

Generate a secret and put it in `.env` as `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then start a database. Either use Docker:

```bash
docker compose up -d
```

…or, if you have no Docker, use the bundled in-process PostgreSQL (PGlite over
a TCP socket - a real Postgres compiled to WASM):

```bash
npm run dev:db
```

`dev:db` listens on `localhost:5432` and matches the `DATABASE_URL` in
`.env.example`. It accepts **one connection at a time**, so set
`DATABASE_POOL_MAX=1` in `.env` when using it.

Apply the schema, load demo data, and run:

```bash
npm run prisma:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

### Demo logins

Seeded accounts, all with password `DemoPass2026`:

| Email | Role |
| --- | --- |
| `admin@dajda.ge` | ადმინისტრატორი |
| `giorgi@dajda.ge` | ანალიტიკოსი (approved analyst) |
| `user@dajda.ge` | მომხმარებელი |

Every seeded row carries `isDemo: true` and renders with a **დემო** badge.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (no database required) |
| `npm run verify` | typecheck → lint → test → build |
| `npm run dev:db` | In-process PostgreSQL for local development |
| `npm run prisma:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Load Georgian demo data |
| `npm run verify:migrations` | Apply migrations to a throwaway Postgres and assert the constraints actually bite |
| `npm run verify:payments` | End-to-end webhook checks against a running app |

---

## Architecture

```
src/
  app/
    (site)/          public pages: home, free tickets, analysts, legal
    (auth)/          login, register, forgot-password, reset-password, verify-email
    dashboard/       subscriber area (server-side session gate in the layout)
    admin/           moderation, prediction settlement, mapping manager, audit log
    api/             REST reads, health, payment webhook, dev-only simulator
    dev/checkout/    stand-in for the gateway's hosted page (mock provider only)
  actions/           Server Actions - all mutations, Zod-validated and authorized
  components/        design system, domain cards, SVG charts
  lib/
    auth/            scrypt, sessions, RBAC, entitlements
    markets/         canonical mapping engine
    predictions/     immutability rules, settlement maths, write service
    payments/        provider interface, mock, Flitt, webhook processor
    stats/           ROI, hit rate, streaks, ranking
    queries/         read models
    validation/      every Zod schema
prisma/              schema, migrations, seed
scripts/             dev database and verification tools
tests/               Vitest suites
```

### Where the API lives

Mutations are **Server Actions** (`src/actions/`), which carry Next's built-in
Origin/Host CSRF protection. Route handlers are reserved for callers that have
no session: the payment webhook, public JSON reads, and the health probe.

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/free` | GET | Public free-ticket feed. Excludes the paid analysis body. |
| `/api/analysts` | GET | Leaderboard; every rate ships with its sample size. |
| `/api/analysts/[slug]` | GET | Full public record, including losses. |
| `/api/webhooks/payments/[provider]` | POST | Signature-verified. The only thing that activates a subscription. |
| `/api/health` | GET | Liveness + database reachability. |
| `/api/dev/simulate-payment` | POST | Dev only; 404s unless `PAYMENT_PROVIDER=mock`. |

---

## Design decisions

### 1. Canonical market mapping never guesses

Different providers name the same market differently - Betsson calls it `x`,
Betlive calls it `y`, and both mean `GOAL`. Resolution is an **exact** lookup on
`(provider, sport, normalizedLabel, period)`.

Normalisation is only Unicode NFKC + trim + whitespace-collapse + lowercase.
There is deliberately **no** fuzzy matching, substring matching, stemming or
keyword detection. A label resolves because a human mapped it, or it does not
resolve at all and is flagged `NEEDS_REVIEW` with the raw label preserved.

Notably, a label that literally reads `"goal"` does **not** resolve to `GOAL`
unless someone mapped it - there is a test asserting exactly that.

A published prediction may never be in `NEEDS_REVIEW`; a database `CHECK`
constraint enforces it independently of the application.

Editing a mapping never mutates the row. It **supersedes** it: the old version
is deactivated, linked to its replacement, and kept forever, so the
interpretation applied to a historical prediction stays reconstructible. A
partial unique index guarantees at most one *active* mapping per key.

### 2. Predictions are immutable after publication

Once `publishedAt` is set, these are frozen: odds, line, selection, scope,
period, player, stake, author, match, and the timestamps themselves. Only
presentation fields (title, analysis text, confidence, visibility) stay
editable, and only while the prediction is unsettled.

Every edit **attempt** is written to `PredictionEdit` - including the ones the
service refused. Those rejected rows are the point: they are the evidence that
the published record was not quietly rewritten, and they are shown publicly on
the prediction page.

Genuine corrections go through a controlled flow that creates a **new version**
linked to the original. The original stays published and visible, marked as
superseded, and is excluded from statistics so a correction cannot be counted
twice.

### 3. Only a verified webhook grants access

The browser redirect after payment activates nothing. It renders a "pending
confirmation" state. A subscription becomes `ACTIVE` only when a
server-to-server webhook is received, its signature verified, its amount and
currency matched against the payment we created, and its status transition
allowed.

- Idempotency is enforced by a unique index on `(providerCode, eventId)` - a
  concurrent double delivery loses the race rather than being checked-then-written.
- Status may only follow an explicitly allowed edge, so a late or out-of-order
  delivery cannot walk a payment backwards.
- An **unrecognised** `order_status` is never coerced into success; it is logged
  for review and nothing is applied.
- Invalid-signature deliveries are still recorded, so a burst of them is visible
  on the admin payments page.
- Refunds and chargebacks end access.

### 4. Ranking is never bare win rate

An analyst's score is ROI shrunk toward zero by a prior of 20 units of stake,
and - more importantly - **analysts below the adequate-sample threshold always
sort below those above it** on the default ordering. They remain visible and
badged "მცირე შერჩევა".

This rule exists because shrinkage alone was not enough: the seeded 7–2 author
at long odds out-scored a 26–13 author on shrunk ROI. Sample size, full W/L/P
record and the actual unit total are shown next to every rate.

### 5. First-party auth instead of Auth.js

Passwords use `node:crypto` scrypt (N=16384, r=8) with per-password salts and
parameters embedded in the digest for future upgrades. Sessions are opaque
256-bit tokens stored only as SHA-256, so a database leak cannot be replayed as
a login - and they are revocable, which is used on password reset and when an
admin suspends an account.

This avoids a beta dependency and keeps session revocation and RBAC in code we
control and test. Trade-off: no social login yet.

### 6. Integers, not floats

No floating point or `Decimal` reaches the UI. Odds are thousandths
(`1.85 → 1850`), units are hundredths, money is currency minor units. This keeps
arithmetic exact and avoids Prisma `Decimal` objects failing to serialise across
the server/client boundary.

---

## Database

24 tables. UUID primary keys, `createdAt`/`updatedAt` throughout, and indexes on
every filtered or sorted column.

### Migrations

| Migration | Contents |
| --- | --- |
| `20260810000000_init` | All tables, enums, foreign keys and indexes |
| `20260810000001_integrity_constraints` | Guarantees Prisma's schema language cannot express |

The second migration is hand-written and adds:

- a **partial unique index** limiting each mapping key to one `isActive` row
  while keeping full history;
- a partial unique index limiting a user to one `ACTIVE` subscription per plan;
- a `CHECK` that a published prediction must be `RESOLVED` with a canonical
  market;
- `CHECK`s that odds exceed 1.000, stakes are positive, payments are positive,
  a settled result is never `PENDING`, and a report points at exactly the target
  its type declares.

`npm run verify:migrations` applies both to a throwaway PostgreSQL and then
tries to violate each constraint, asserting the database refuses.

### Apply

```bash
npm run prisma:migrate   # production / CI: prisma migrate deploy
npx prisma migrate dev   # development, when changing schema.prisma
```

Prisma 7 moved the datasource URL out of `schema.prisma`; it now lives in
`prisma.config.ts` for the CLI and reaches the client through the `pg` driver
adapter in `src/lib/db.ts`.

---

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | ≥32 chars; signs session material |
| `APP_URL` | yes | Public origin; cookie scope, return URLs, callback URL |
| `PAYMENT_PROVIDER` | yes | `mock` or `flitt` |
| `MOCK_PAYMENT_SECRET` | mock only | Signs simulated webhooks |
| `FLITT_MERCHANT_ID` | flitt only | Merchant id |
| `FLITT_SECRET_KEY` | flitt only | Payment key used for request signatures |
| `FLITT_WEBHOOK_SECRET` | flitt | Callback key; falls back to `FLITT_SECRET_KEY` |
| `FLITT_API_URL` | flitt | Defaults to `https://pay.flitt.com` |
| `DATABASE_POOL_MAX` | no | Cap the pool. Set to `1` for `npm run dev:db`. |

Environment is parsed and validated by Zod at first use
(`src/lib/env.ts`); selecting `flitt` without credentials fails at boot rather
than at a customer's checkout. Only `.env.example` is committed.

---

## Testing Flitt locally with the mock provider

Set `PAYMENT_PROVIDER=mock`. Checkout then returns a URL to `/dev/checkout`
instead of a gateway.

That page **does not** touch the database. Its buttons call
`/api/dev/simulate-payment`, which signs a payload and performs a genuine HTTP
POST to the same `/api/webhooks/payments/mock` endpoint production uses. If
signature verification, idempotency or the transition rules were broken, the
development flow would break too.

1. Sign in, pick a plan, press გამოწერა.
2. You land on `/dev/checkout` with the order id and amount.
3. Press **წარმატებული გადახდა** → a signed webhook fires → the subscription
   activates. The panel reports the processor's decision (`APPLIED`).
4. Press **იმავე event-ის გამეორება** → the same event id is replayed →
   `DUPLICATE_IGNORED`, and nothing is applied twice.
5. **უარყოფილი გადახდა** exercises the declined path.

`/api/dev/simulate-payment` returns 404 unless `PAYMENT_PROVIDER=mock`, and
requires a signed-in user, so it cannot exist as an open relay in a deployment
pointed at a real gateway.

To assert the whole contract automatically, with the app running:

```bash
npm run verify:payments
```

### Switching to Flitt

Set `PAYMENT_PROVIDER=flitt` and supply the credentials. No call site changes -
every caller goes through the `PaymentProvider` interface.

The adapter is written against the published specification
(<https://docs.flitt.com>): `POST /api/checkout/url` with a `{"request":{…}}`
envelope, amount in minor units, and a signature of
`sha1(secret + "|" + <non-empty params sorted by key, joined by "|">)` in
lowercase hex. Callbacks are verified by stripping `signature` and
`response_signature_string`, re-deriving, and comparing in constant time. The
documented `order_status` enum (`created|processing|declined|approved|expired|reversed`)
is mapped explicitly; anything else is treated as unknown.

The signature functions are unit tested against the **worked example from
Flitt's own documentation**, so the algorithm is verified. What is *not*
verified is the live HTTP conversation - see [Assumptions](#assumptions).

---

## Security

- **CSRF** - mutations are Server Actions, protected by Next's Origin/Host
  check. The webhook is exempt by design and authenticated by signature.
- **Access control** - enforced server-side in every layout, page and action via
  `requireUser` / `requireAdmin` / `requireApprovedAnalyst`. `src/proxy.ts`
  performs **no** authorization; it runs before any database lookup and cannot
  distinguish a valid session from a forged cookie.
- **IDOR** - the actor is always resolved from the session cookie, never from a
  client-supplied id. Ownership is re-checked on every scoped write.
- **Paid content** - gated by a single entitlement rule (`satisfiesVisibility`),
  unit tested, with analyst-scoped plans unable to unlock another analyst.
- **Enumeration** - login answers identically for unknown account, wrong
  password and suspended account, and burns comparable time via a dummy digest.
  Password reset always reports success.
- **Rate limiting** - login (per IP *and* per account), registration, password
  reset, reports and checkout. In-process; swap in Redis behind multiple
  instances via the `RateLimiter` interface.
- **Injection** - all database access goes through Prisma's parameterised query
  builder. The single raw query is a literal `SELECT 1`.
- **XSS** - React escapes by default; no `dangerouslySetInnerHTML` anywhere. CSP
  is nonce-based with `strict-dynamic`.
- **Secrets** - never committed; `.env` is gitignored and env is schema-validated.
- **Uploads** - there are none. Avatars are generated initials, which removes the
  unsafe-upload surface entirely.
- **Card data** - never touches the server. Only masked descriptors are stored.
- **Privilege escalation** - admins cannot change their own status, and admin
  accounts cannot be suspended through the UI.

---

## Accessibility

Semantic landmarks, exactly one `<h1>` per page, skip link, visible focus rings
on everything focusable, 44px minimum touch targets, labelled form controls with
`aria-invalid` + `aria-describedby` error wiring, `role="alert"` on errors, wide
tables scrolling inside their own containers, and an `sr-only` data table
mirroring the monthly chart.

Status is never conveyed by colour alone - every result chip carries its
Georgian label. Body text is 16px, nothing is below 12px, and the palette meets
WCAG AA on the charcoal background (contrast ratios documented in
`globals.css`). `prefers-reduced-motion` is respected.

Dark mode only, by choice: a second theme would dilute the contrast
relationships the status colours rely on.

---

## Assumptions

1. **Legal copy is a draft.** The four documents under `/legal` are placeholders
   and are labelled as such in the UI. They need review against Georgian law
   before launch - particularly the boundary between selling analysis and
   regulated gambling activity.
2. **Flitt is unverified against a live account.** No credentials exist in this
   environment. The adapter follows the published spec and its signature logic
   is tested against Flitt's documented example, but the HTTP conversation,
   error codes and callback field names have not been exercised against a real
   merchant. Expect a short integration pass.
3. **No email delivery.** Verification and reset tokens are issued, hashed and
   expired correctly, but nothing sends them; in development the reset link is
   printed to the server console. A mailer is the only missing piece.
4. **Telegram is stored, not integrated.** The username and preference are
   captured; no bot exists yet.
5. **Age confirmation is a self-certified checkbox**, stored with a timestamp.
   Whether that suffices is a legal question.
6. **Rate limiting is per-instance.** Behind multiple instances the effective
   limit multiplies; the interface exists for a Redis implementation.
7. **Analyst self-signup is not exposed.** The schema, approval workflow and
   admin queue all exist; the public application form does not. Analysts are
   seeded or created by an admin.
8. **Settlement is manual.** An admin records the outcome and a mandatory
   source. `evaluateOutcome` can suggest a result from match data but never
   settles automatically, and returns `null` rather than guessing.
#   d a j d a 
 
 

## Deploying a demo

The app needs a real PostgreSQL and nothing else. Bet screenshots are stored as
rows in the database (`model Screenshot`), not as files, so no persistent disk
is required and any host will do: Vercel, Railway, Fly.io, a VPS.

That is a deliberate trade for a small deployment. Blobs in a row make backups
heavier and skip the CDN; at real volume they belong in object storage, which
is a change to `storeScreenshot`/`readStoredScreenshot` in `src/lib/uploads.ts`
and nothing else, because the rest of the product only ever sees the
`/uploads/<name>` path string.

Environment for a demo deployment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | your Postgres connection string |
| `AUTH_SECRET` | 32+ chars, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | the public `https://` origin, no trailing slash |
| `DEMO_MODE` | `true` |
| `PAYMENT_PROVIDER` | `mock` |

Then once, against the deployed database:

```
npx prisma migrate deploy
npm run db:seed
```

`DEMO_MODE=true` is what allows the mock payment provider to run on a public
host. It waives the two payment checks in `src/lib/env.ts` and nothing else -
`APP_URL` must still be https, or the guard refuses to boot, because the
session cookie's `Secure` flag is derived from it. It also cannot be combined
with `PAYMENT_PROVIDER=flitt`: a demo must not be able to reach a live
merchant. While it is on, every page carries a banner saying so.
