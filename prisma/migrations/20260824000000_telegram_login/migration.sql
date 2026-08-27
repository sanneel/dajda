-- Telegram login.
--
-- Additive only: one nullable column plus its unique index, so this is safe to
-- apply to a live database. The id is stored as TEXT rather than BIGINT
-- because it is an opaque lookup key - nothing ever does arithmetic on it, and
-- text sidesteps any int-width assumption about Telegram's id space.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
