-- Analyst earnings, payouts, and the identity side of an analyst application.
--
-- The user's two balances are kept apart: "balanceMinor" is money put in with a
-- card and spendable here, "earningsMinor" is money subscribers paid and is the
-- only source a payout may draw on. A single sum would make a card top-up
-- withdrawable back to a card.

-- New ledger vocabulary. Adding values only, never using them in this
-- transaction, which is what Postgres permits here.
ALTER TYPE "BalanceEntryKind" ADD VALUE 'ANALYST_EARNING';
ALTER TYPE "BalanceEntryKind" ADD VALUE 'ANALYST_EARNING_REVERSAL';
ALTER TYPE "BalanceEntryKind" ADD VALUE 'WITHDRAWAL';
ALTER TYPE "BalanceEntryKind" ADD VALUE 'WITHDRAWAL_REVERSAL';

CREATE TYPE "BalanceAccount" AS ENUM ('SPENDING', 'EARNINGS');

CREATE TYPE "PayoutStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'PAID',
  'REJECTED',
  'FAILED'
);

ALTER TABLE "User" ADD COLUMN "earningsMinor" INTEGER NOT NULL DEFAULT 0;

-- Deliberately allowed to go negative. If a subscriber charges back after the
-- analyst has already withdrawn that month's money, the analyst owes it, and a
-- negative balance is how the next period's earnings absorb it. Clamping at
-- zero would quietly forgive the debt.

-- ---------------------------------------------------------------------------
-- Application fields
-- ---------------------------------------------------------------------------

-- Nullable because profiles that predate the application form exist (seeded
-- demo authors), and backfilling a legal name from a public byline would be
-- inventing data. Every new application fills them.
ALTER TABLE "AnalystProfile" ADD COLUMN "firstName" TEXT;
ALTER TABLE "AnalystProfile" ADD COLUMN "lastName" TEXT;
ALTER TABLE "AnalystProfile" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "AnalystProfile" ADD COLUMN "primarySportId" UUID;
ALTER TABLE "AnalystProfile" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "AnalystProfile" ADD COLUMN "identityDocumentId" UUID;

CREATE TABLE "IdentityDocument" (
    "id" UUID NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalystProfile_identityDocumentId_key"
  ON "AnalystProfile"("identityDocumentId");

ALTER TABLE "AnalystProfile"
  ADD CONSTRAINT "AnalystProfile_primarySportId_fkey"
  FOREIGN KEY ("primarySportId") REFERENCES "Sport"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalystProfile"
  ADD CONSTRAINT "AnalystProfile_identityDocumentId_fkey"
  FOREIGN KEY ("identityDocumentId") REFERENCES "IdentityDocument"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------

CREATE TABLE "AnalystPayout" (
    "id" UUID NOT NULL,
    "analystProfileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "maskedCard" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerCode" TEXT,
    "providerPayoutId" TEXT,
    "rawStatus" TEXT,
    "failureReason" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "publicationsInPeriod" INTEGER NOT NULL,
    "activityCheckPassed" BOOLEAN NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,

    CONSTRAINT "AnalystPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalystPayout_providerOrderId_key"
  ON "AnalystPayout"("providerOrderId");

CREATE INDEX "AnalystPayout_status_requestedAt_idx"
  ON "AnalystPayout"("status", "requestedAt");

CREATE INDEX "AnalystPayout_userId_requestedAt_idx"
  ON "AnalystPayout"("userId", "requestedAt");

ALTER TABLE "AnalystPayout"
  ADD CONSTRAINT "AnalystPayout_analystProfileId_fkey"
  FOREIGN KEY ("analystProfileId") REFERENCES "AnalystProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalystPayout"
  ADD CONSTRAINT "AnalystPayout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A payout for nothing, or for a negative amount, is never a real request.
ALTER TABLE "AnalystPayout"
  ADD CONSTRAINT "AnalystPayout_amount_positive" CHECK ("amountMinor" > 0);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------

ALTER TABLE "BalanceTransaction"
  ADD COLUMN "account" "BalanceAccount" NOT NULL DEFAULT 'SPENDING';

ALTER TABLE "BalanceTransaction" ADD COLUMN "payoutId" UUID;

ALTER TABLE "BalanceTransaction"
  ADD CONSTRAINT "BalanceTransaction_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "AnalystPayout"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One hold and one return per payout, however often a decision is retried.
CREATE UNIQUE INDEX "BalanceTransaction_payoutId_kind_key"
  ON "BalanceTransaction"("payoutId", "kind");
