-- Analyst feed and the notification outbox.
--
-- Additive only. Nothing existing is dropped or rewritten, so this is safe to
-- apply to a live database: two new tables, three new enums, and one new opt-in
-- column on NotificationPreference that defaults to true.
--
-- The outbox intentionally stores no delivery mechanism. Rows are written when
-- an analyst opens a live session and stay PENDING until a sender is
-- configured, so "who should have been told" survives even though nothing has
-- actually been sent yet.

-- CreateEnum
CREATE TYPE "AnalystPostKind" AS ENUM ('NOTE', 'LIVE_NOTICE', 'LIVE_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "emailOnLiveSession" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AnalystPost" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "AnalystPostKind" NOT NULL DEFAULT 'NOTE',
    "bodyKa" TEXT NOT NULL,
    "liveAt" TIMESTAMP(3),
    "liveLabelKa" TEXT,
    "parentId" UUID,
    "endedAt" TIMESTAMP(3),
    "visibility" "PredictionVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "destination" TEXT,
    "subjectKa" TEXT NOT NULL,
    "bodyKa" TEXT NOT NULL,
    "linkPath" TEXT,
    "postId" UUID,
    "predictionId" UUID,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalystPost_authorId_createdAt_idx" ON "AnalystPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalystPost_kind_liveAt_idx" ON "AnalystPost"("kind", "liveAt");

-- CreateIndex
CREATE INDEX "AnalystPost_parentId_idx" ON "AnalystPost"("parentId");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnalystPost" ADD CONSTRAINT "AnalystPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystPost" ADD CONSTRAINT "AnalystPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AnalystPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "AnalystPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
