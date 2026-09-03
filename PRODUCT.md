# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a Georgian bettor deciding whose analysis to pay for.** They already
bet elsewhere. They arrive before a match, usually on a phone, and the question
they carry is "who here is actually worth paying?" They answer it from an
author's public record, then either buy one ticket or subscribe to that author
for a month. (Confirmed by the owner.)

**Authors** ("ანალიტიკოსი"): identity-verified Georgian analysts who publish a
bet slip screenshot, odds, kickoff time and optional written analysis, mark the
bet finished after the match, and are paid a share of what their subscribers
and ticket buyers spend. They apply with an ID document and a declared monthly
minimum, sign the placement agreement, and are approved by the administrator.

**Administrator**: the owner. Settles every finished bet by hand against a named
source, approves applications, releases payouts, answers reports.

## Product Purpose

DAJDA (dajda.ge, trade name დაჯდა) sells access to written sports analysis by
vetted Georgian authors and publishes each author's complete performance
record: wins, losses and open bets alike. Money enters only as payment for
content (a monthly subscription to one author or a single ticket; there is
no balance top-up, decided 2026-09-03). Success means a buyer can check an author's history
before paying, and an author who delivers gets paid on the last day of the
month.

Tagline in the repository: "ნახე ვინ დადო სწორად." (see who got it right).

## Positioning

The claim the owner put first: **Georgian-language analysis from vetted local
authors.** Every author is a named, identity-checked person under a signed
agreement with a declared monthly output, not a handle.

The mechanism that makes the claim checkable rather than asserted: an author's
record is complete and cannot be edited. A published bet's odds, slip and
timestamps are frozen; corrections create a new version and keep the original
visible; outcomes are recorded by the administrator with a mandatory source;
losses count. Ranking never shows bare win rate, and authors below the sample
threshold sort below the rest and are labelled "მცირე შერჩევა".

## Operating Context

- Georgian market, Georgian legal entity (sole proprietor, Tbilisi; details in
  `src/lib/company.json`). Prices in GEL. Every time shown is Tbilisi time
  (UTC+4, no daylight saving); authors type kickoff times in Tbilisi time.
- Evidence is a photograph: authors post bookmaker slip screenshots from a
  phone (up to 6 per ticket, re-encoded server-side). The slip is the bet; the
  written analysis is optional. The screenshot is never shown publicly: it
  carries the bookmaker's branding and often the author's balance, and the
  product must not display either. Authors type the legs (match, pick, odds)
  and the public sees a DAJDA-drawn ticket; the screenshot stays with the
  author and the administrator, who settles against it. Decided 2026-09-03.
- One subscription per author, monthly, at 30, 40 or 50 GEL, chosen by the
  author. Single tickets have their own price. Authors receive 85%
  (`ANALYST_SHARE_PERCENT`, matching the signed agreement) and may withdraw
  only on the last calendar day of the month, to a card, after an
  administrator releases it. A weekly activity check is advisory to that
  decision, not a gate.
- Payment gateway: Flitt (Georgian). Nothing activates on the browser
  redirect; only a verified server webhook grants access. A mock provider and a
  labelled demo mode exist for development.
- Flitt merchant terms as approved on 2026-09-02 (MCC 5815, from their
  activation email): 2% on Georgian bank cards, 2.5% on foreign cards, no
  minimum or monthly fee, Apple Pay and Google Pay at no extra charge. Limits:
  500 GEL per transaction, 10,000 GEL per day and 50,000 GEL per month in
  total; per card, 5 transactions or 3,000 GEL a day and 30 transactions or
  5,000 GEL a month. Single tickets are capped at 500 GEL to match.
- Notifications go out by email (Resend or Brevo) and by a Telegram bot the
  reader links themselves. Sign-in is email and password, Google, or Telegram.
- The administrator's Telegram is @gulfishotdog. When an author marks a bet
  finished, every administrator who has linked the bot from their own settings
  page gets a Telegram message at once, so the outcome can be checked and
  settled without watching the queue. Linking is done through the same
  settings flow as a reader; no chat id or username is configured anywhere.
- Legal texts live in `docs/legal` (terms, privacy, responsible use, author
  agreement) and are matched clause by clause to signed PDFs; the platform
  pages render them. Clause numbers are referenced from code comments.
- Sports covered: football, basketball, tennis, rugby, volleyball, handball,
  ice hockey, MMA, boxing, esports.

## Capabilities and Constraints

- **Not a bookmaker, and must never look or read like one.** No wagers are
  taken, no winnings paid, no bets placed on anyone's behalf. Terms §3 and the
  responsible-use text state this; the owner made it a binding design
  constraint. No casino cues, no odds-board styling, no currency or chip
  imagery in the brand mark.
- **Georgian-only interface** (owner-confirmed). Latin appears only in slugs,
  codes, provider names and the wordmark.
- **18+.** Self-certified at registration with a timestamp; the responsible-use
  notice appears on ticket pages. Whether self-certification suffices is an
  open legal question recorded in the README.
- "Units" are a bookkeeping convention (every ticket counted as a flat 100 GEL
  stake), not a currency and not redeemable. Readers hold no balance on the
  platform; the only ledger is an author's earned income, withdrawable on
  the last day of the month.
- Records are immutable after publication; every edit attempt, refused or not,
  is logged. A bet published after its event starts does not count in the
  author's statistics (terms §8.1). Enforcement of §8.1 in code is not
  confirmed.
- Settlement is manual. There is no automatic outcome evaluation.
- Demo content is flagged `isDemo`, badged "დემო", and must be purged before
  real users arrive (`npm run demo:purge`).
- Undecided: whether the product is phone-first for readers as well as
  authors was offered and not confirmed by the owner. Author posting is
  phone-based by nature of the evidence.

## Brand Commitments

- Name: DAJDA / დაჯდა. Domain dajda.ge. Support: support@dajda.ge.
- Mark: a ticket with a torn perforation edge and a settled check ("a slip that
  landed"), in `src/components/brand/logo.tsx`. Deliberately no coin, note,
  currency glyph, dice, chip or card suit.
- Voice: plain, factual Georgian. Statistics are described as the past, never
  as a promise; losses are shown on purpose and the copy says why.
- Binding constraint, restated: nothing on the product may resemble a
  bookmaker's or casino's interface. Colour in the current system is reserved
  for how a bet resolved; that rule was set by the owner and is not up for
  re-litigation.

## Evidence on Hand

- Real: the four legal documents in `docs/legal`, the company registration
  details, the brand mark, the sports list, the pricing and payout rules in
  code and in the agreement.
- Invented: every seeded author, bet, result and subscriber (`prisma/seed.ts`,
  all `isDemo`). No real author record, testimonial, press mention or
  performance figure exists yet. Future work must not present demo records as
  real or invent any of these.
- The README's "Design decisions" and "Assumptions" sections are partly stale
  (they describe a market-mapping engine, dark-mode-only, no email, no
  Telegram and no author self-signup, all of which have since changed). Prefer
  the code and the legal texts over those sections.

## Product Principles

1. **The record is the proof.** Every number on the site must be checkable
   from the bets behind it; losses are never hidden or softened.
2. **Money only buys content.** No feature may let money be wagered, won,
   or moved in a way that resembles gambling.
3. **Verified people, not handles.** An author is a named, documented person
   under an agreement; the product shows enough of that for a buyer to trust
   it.
4. **Plain Georgian, nothing borrowed from bookmakers.** Copy states facts;
   the interface must not be mistaken for a betting shop.
5. **Immutability over convenience.** When a change would make history less
   trustworthy, the product refuses it or versions it visibly.

## Accessibility & Inclusion

Established in the codebase and to be preserved: semantic landmarks and one
`h1` per page, skip link, visible focus rings, 44px minimum touch targets,
labelled controls with `aria-invalid` and `aria-describedby`, errors announced
with `role="alert"`, status never conveyed by colour alone (every result chip
carries its Georgian label), body text 16px with nothing below 12px, WCAG AA
contrast audited against the worst ground a colour lands on, wide tables
scrolling in their own container, `prefers-reduced-motion` respected.
