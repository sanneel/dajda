# Test cases

What is checked, by what, and what still needs a person.

Three layers, each catching what the one below cannot:

| Layer | Command | Needs | Catches |
| --- | --- | --- | --- |
| Unit | `npm test` | nothing | rules, arithmetic, validation, refusals |
| Pages | `npm run verify:pages` | built app + seeded database | a page that stopped rendering, or stopped refusing |
| Migrations | `npm run verify:migrations` | nothing (throwaway database) | a constraint that no longer bites |
| Payments | `npm run verify:payments` | running app + database | the webhook contract end to end |

`npm run verify` runs typecheck, lint, unit tests and the build. It does **not**
run the page, migration or payment checks: those need a database, and the
failures they catch are the ones that reach production, so run them before a
deploy that touches shared plumbing (`src/lib/db`, `src/lib/env`, layouts,
the header, authorization).

---

## 1. Automated: unit (`npm test`)

| Area | File | Notes |
| --- | --- | --- |
| Passwords, tokens, sessions | `tests/auth.test.ts` | hashing, salting, tampered digests |
| Entitlements and ticket locking | `tests/auth.test.ts` | who may open a paid ticket |
| Settlement arithmetic | `tests/predictions.test.ts` | profit, rounding, returned stake |
| Record immutability | `tests/predictions.test.ts` | a published bet cannot be rewritten |
| Performance figures | `tests/performance.test.ts` | hit rate, streaks, units |
| Payout rules and calendar | `tests/payouts.test.ts` | share, window, IBAN |
| Webhook application | `tests/webhook.test.ts` | forged signature, replay, amount mismatch |
| Environment guard | `tests/env.test.ts` | every production misconfiguration |
| Database client | `tests/db-import.test.ts` | import needs no environment; one client per process |
| Health probe | `tests/health.test.ts` | names configuration vs database |
| Name ownership | `tests/account-identity.test.ts` | an analyst cannot rename themselves |
| **Refusals** | `tests/negative.test.ts` | hostile input, listed below |

### Negative cases (`tests/negative.test.ts`)

Each group asserts a valid control first. A negative test whose baseline is
already invalid passes for the wrong reason — that happened on the first
draft of this file and is why the controls are there.

| # | Input | Must |
| --- | --- | --- |
| N1 | `/uploads/../../etc/passwd`, `/uploads/../secret.webp`, `..%2f`, `/etc/passwd` | be refused — the path is served back, so escaping the directory discloses files |
| N2 | `/uploads/x.svg`, `.webp.exe`, upper case, no leading slash, absolute URL, embedded newline | be refused — only what the store itself writes is accepted |
| N3 | Bet with no screenshot | be refused — a bet with no evidence is not a record |
| N4 | Odds `1.00`, `0.5`, `-2`, `abc`, `Infinity` | be refused |
| N5 | `sportId` = `"1"`, `"<uuid> OR 1=1"` | be refused |
| N6 | `visibility` = `ADMIN`, `SECRET`, `public` | be refused |
| N7 | Slip with 21 legs | be refused |
| N8 | Settle as `PENDING`, `VOID`, `won`, `WIN` | be refused — only WON, LOST, PUSH settle |
| N9 | Monthly minimum `7`, `0`, `-5`, `8.5`, `10000` | be refused — terms 6.4 sets the floor at 8 |
| N10 | Withdrawal `0`, `-10`, `1000000`, `abc` | be refused |
| N11 | IBAN too short or too long | be refused |
| N12 | `planId`, `analystProfileId` that are not UUIDs | be refused |
| N13 | Report `targetType` = `USER`, reason not in the enum | be refused |
| N14 | Registration without `ageConfirmed` or `acceptTerms` | be refused — the platform is 18+ |
| N15 | Malformed addresses (`someone@`, `@example.com`, `a b@c.d`) | be refused |
| N16 | Application with `acceptTerms` false or `"true"` | be refused |
| N17 | Name of 1 character, 81 characters, or only whitespace | be refused |

---

## 2. Automated: pages (`npm run verify:pages`)

Drives the built application over HTTP as four viewers — anonymous, reader,
analyst, and a forged cookie — and asserts each route either renders or
refuses. 55 checks.

Only a 2xx counts as rendered. A route that must refuse may bounce to
sign-in, redirect home, 403 or 404; the only wrong answer is showing the page.
A route that must render has to actually answer — a signed-in request
redirected away is the session not being honoured.

### Positive

| # | Viewer | Must render |
| --- | --- | --- |
| P1 | anonymous | `/`, `/free`, `/paid`, `/pricing`, `/how-it-works`, `/legal`, `/contact`, `/login`, `/register`, `/forgot-password`, `/api/health`, `/robots.txt`, `/sitemap.xml` |
| P2 | anonymous | an author's profile, a free ticket |
| P3 | reader | everything above, plus `/dashboard`, `/dashboard/settings`, `/apply` |
| P4 | reader | a locked paid ticket — its gate, not an error |
| P5 | analyst | `/analyst`, `/analyst/earnings`, their own profile page |

### Negative

| # | Viewer | Route | Must |
| --- | --- | --- | --- |
| P6 | anonymous | `/dashboard`, `/dashboard/settings`, `/apply` | refuse |
| P7 | anonymous | `/analyst`, `/analyst/earnings` | refuse |
| P8 | anonymous | `/admin`, `/admin/predictions`, `/admin/users`, `/admin/payouts` | refuse |
| P9 | reader | `/analyst`, `/analyst/earnings` | answer with the "no analyst profile" notice, **never the workspace** |
| P10 | reader | every `/admin/*` route | refuse |
| P11 | analyst | every `/admin/*` route | refuse |
| P12 | forged cookie | `/dashboard`, `/analyst`, `/admin` | refuse — a well-formed token that was never issued |

P9 is asserted on both sides: the author must get the workspace and **not**
the notice. Without that, the check passes on a page broken for everybody.

---

## 3. Manual

What no script covers. Run against a preview deployment.

### Money

| # | Steps | Expected |
| --- | --- | --- |
| M1 | Subscribe to an author, pay with a test card | access opens only after the webhook lands, never on the browser redirect |
| M2 | Cancel a subscription | access lasts to the end of the paid period |
| M3 | Subscribe to the same author twice | refused — one active subscription per plan |
| M4 | Buy a single paid ticket | that ticket opens; the author's other paid tickets stay shut |
| M5 | Request a payout on a day outside the window | refused, with the next window named |
| M6 | Request a payout twice in a row | the second is refused while the first is pending |
| M7 | Author with no activated price | their page says so; there is no subscribe button to press |

### Uploads

| # | Steps | Expected |
| --- | --- | --- |
| M8 | Post a bet with a 20 MB photo | refused, with the size named |
| M9 | Upload a PDF or an SVG renamed to `.webp` | refused |
| M10 | Upload a photo with EXIF GPS | stored image carries no metadata |
| M11 | Change the profile photo from the avatar | the new face appears on the profile, the workspace and the header |
| M12 | Change it 11 times in an hour | rate limited |

### Identity and access

| # | Steps | Expected |
| --- | --- | --- |
| M13 | As an analyst, open Settings | the name is read-only, with the reason |
| M14 | As a reader, open Settings | the name is editable and saves |
| M15 | Sign in on two devices, sign out of one | the other session still works |
| M16 | Close the account, then sign in | refused |
| M17 | Open a bet's settle form as a non-admin | not reachable |

### Content

| # | Steps | Expected |
| --- | --- | --- |
| M18 | Post a bet, mark it finished, settle it as admin | the record and the figures move together |
| M19 | Settle the same bet twice | the second is refused |
| M20 | Settle an unpublished draft | refused |
| M21 | Filter admin bets by type, sport, and review state | the count and the rows agree |
| M22 | Publish a subscription ticket with no active plan | refused |

### Presentation

| # | Steps | Expected |
| --- | --- | --- |
| M23 | Every page at 375 px wide | no horizontal scroll |
| M24 | Light and dark theme | no unreadable text |
| M25 | Avatar menu on a phone | opens, closes on Escape, on the backdrop, and on navigation |
| M26 | Georgian text in a name, a bet title, a report | renders and is escaped, not executed |

---

## Adding a case

A bug that reached production gets a test in the layer that would have caught
it, in the same change as the fix. If no layer would have caught it, that is
the finding — the layer is missing, not the test.
