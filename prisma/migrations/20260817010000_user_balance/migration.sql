-- The user balance: a cached total on User plus an append-only signed ledger.
-- The cache is only ever written in the same transaction as a ledger row.

CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'BALANCE_TOPUP');

CREATE TYPE "BalanceEntryKind" AS ENUM (
  'TOPUP',
  'SUBSCRIPTION_PAYMENT',
  'TOPUP_REVERSAL',
  'ADJUSTMENT'
);

ALTER TABLE "User" ADD COLUMN "balanceMinor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Payment"
  ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION';

CREATE TABLE "BalanceTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "BalanceEntryKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "balanceAfterMinor" INTEGER NOT NULL,
    "paymentId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceTransaction_pkey" PRIMARY KEY ("id")
);

-- One credit and one reversal per payment, however often a webhook re-fires.
CREATE UNIQUE INDEX "BalanceTransaction_paymentId_kind_key"
  ON "BalanceTransaction"("paymentId", "kind");

CREATE INDEX "BalanceTransaction_userId_createdAt_idx"
  ON "BalanceTransaction"("userId", "createdAt");

ALTER TABLE "BalanceTransaction"
  ADD CONSTRAINT "BalanceTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BalanceTransaction"
  ADD CONSTRAINT "BalanceTransaction_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A movement must never claim a balance it does not produce: amount 0 writes
-- no information, and the ledger is append-only so a zero row is a bug.
ALTER TABLE "BalanceTransaction"
  ADD CONSTRAINT "BalanceTransaction_amount_nonzero"
  CHECK ("amountMinor" <> 0);
