-- A paid prediction becomes a product of its own: a per-ticket price, a
-- TICKET payment purpose, and a purchase row per buyer.

ALTER TYPE "PaymentPurpose" ADD VALUE 'TICKET';
ALTER TYPE "BalanceEntryKind" ADD VALUE 'TICKET_PURCHASE';

ALTER TABLE "Prediction" ADD COLUMN "priceMinor" INTEGER;

ALTER TABLE "Payment" ADD COLUMN "predictionId" UUID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_predictionId_fkey"
  FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PredictionPurchase" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "predictionId" UUID NOT NULL,
  "paymentId" UUID,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GEL',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PredictionPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PredictionPurchase_userId_predictionId_key"
  ON "PredictionPurchase"("userId", "predictionId");
CREATE INDEX "PredictionPurchase_predictionId_idx"
  ON "PredictionPurchase"("predictionId");

ALTER TABLE "PredictionPurchase" ADD CONSTRAINT "PredictionPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PredictionPurchase" ADD CONSTRAINT "PredictionPurchase_predictionId_fkey"
  FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
