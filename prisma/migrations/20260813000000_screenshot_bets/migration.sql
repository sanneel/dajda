-- Reshape a prediction from a structured market claim into a posted screenshot.
--
-- The old model described a bet in the platform's own vocabulary: a fixture
-- row, a canonical market resolved from a provider's label, a selection, a
-- line and a period. Analysts now post an image of their own slip instead, so
-- all of that machinery goes, and with it the Provider, CanonicalMarket,
-- ProviderMarketMapping, Match and League tables.
--
-- DESTRUCTIVE, deliberately. `screenshotPath` is NOT NULL and no existing row
-- can supply one. Every prediction on this database is seeded demo data
-- (isDemo = true), so the rows are removed rather than backfilled with a fake
-- image path that would look like evidence. Re-run `npm run db:seed` after.
DELETE FROM "PredictionEdit";
DELETE FROM "PredictionView";
DELETE FROM "PredictionResult";
DELETE FROM "Report" WHERE "predictionId" IS NOT NULL;
DELETE FROM "Prediction";

-- DropForeignKey
ALTER TABLE "CanonicalMarket" DROP CONSTRAINT "CanonicalMarket_sportId_fkey";

-- DropForeignKey
ALTER TABLE "League" DROP CONSTRAINT "League_sportId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_leagueId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_sportId_fkey";

-- DropForeignKey
ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_canonicalMarketId_fkey";

-- DropForeignKey
ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_leagueId_fkey";

-- DropForeignKey
ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_mappingId_fkey";

-- DropForeignKey
ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_matchId_fkey";

-- DropForeignKey
ALTER TABLE "Prediction" DROP CONSTRAINT "Prediction_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderMarketMapping" DROP CONSTRAINT "ProviderMarketMapping_canonicalMarketId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderMarketMapping" DROP CONSTRAINT "ProviderMarketMapping_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ProviderMarketMapping" DROP CONSTRAINT "ProviderMarketMapping_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderMarketMapping" DROP CONSTRAINT "ProviderMarketMapping_sportId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderMarketMapping" DROP CONSTRAINT "ProviderMarketMapping_supersededById_fkey";

-- DropIndex
DROP INDEX "Prediction_leagueId_idx";

-- DropIndex
DROP INDEX "Prediction_matchId_idx";

-- DropIndex
DROP INDEX "Prediction_matchStartsAt_idx";

-- DropIndex
DROP INDEX "Prediction_resolutionStatus_idx";

-- AlterTable
ALTER TABLE "Prediction" DROP COLUMN "analysisKa",
DROP COLUMN "canonicalMarketId",
DROP COLUMN "leagueId",
DROP COLUMN "lineMilli",
DROP COLUMN "mappingId",
DROP COLUMN "matchId",
DROP COLUMN "matchStartsAt",
DROP COLUMN "period",
DROP COLUMN "playerName",
DROP COLUMN "providerId",
DROP COLUMN "rawLabel",
DROP COLUMN "resolutionStatus",
DROP COLUMN "selection",
DROP COLUMN "teamScope",
ADD COLUMN     "descriptionKa" TEXT,
ADD COLUMN     "eventAt" TIMESTAMP(3),
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "resultScreenshotPath" TEXT,
ADD COLUMN     "screenshotPath" TEXT NOT NULL;

-- DropTable
DROP TABLE "CanonicalMarket";

-- DropTable
DROP TABLE "League";

-- DropTable
DROP TABLE "Match";

-- DropTable
DROP TABLE "Provider";

-- DropTable
DROP TABLE "ProviderMarketMapping";

-- DropEnum
DROP TYPE "MarketPeriod";

-- DropEnum
DROP TYPE "MatchStatus";

-- DropEnum
DROP TYPE "ResolutionStatus";

-- DropEnum
DROP TYPE "SelectionType";

-- DropEnum
DROP TYPE "SettlementRule";

-- DropEnum
DROP TYPE "TeamScope";

-- CreateIndex
CREATE INDEX "Prediction_eventAt_idx" ON "Prediction"("eventAt");

-- CreateIndex
CREATE INDEX "Prediction_finishedAt_status_idx" ON "Prediction"("finishedAt", "status");

