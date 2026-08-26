-- Telegram bot delivery, and analyst broadcasts.
--
-- Additive only: one new enum value, one new table, new nullable columns and
-- two indexes. Nothing existing is dropped or rewritten, so this is safe to
-- apply to a live database.
--
-- `telegramChatId` is separate from `telegramId` on purpose. Knowing who
-- somebody is on Telegram does not entitle us to write to them: a bot cannot
-- open a conversation, so the chat id only exists once the person has pressed
-- Start, and clearing it is a complete opt-out.

-- AlterEnum
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'TELEGRAM_LINK';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "broadcastId" UUID,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AnalystBroadcast" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "subjectKa" TEXT NOT NULL,
    "bodyKa" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "telegramCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE INDEX "AnalystBroadcast_authorId_createdAt_idx" ON "AnalystBroadcast"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_channel_status_createdAt_idx" ON "Notification"("channel", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AnalystBroadcast" ADD CONSTRAINT "AnalystBroadcast_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AnalystProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "AnalystBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
