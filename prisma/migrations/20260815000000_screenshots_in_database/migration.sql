-- Screenshots move from the local disk into the database.
--
-- Additive: one new table, nothing dropped. `Prediction.screenshotPath` keeps
-- the same `/uploads/<name>.webp` shape it always had, so no existing row
-- changes and no other table is touched. Only what sits behind that path
-- moves.
--
-- Any file already written to an `uploads/` directory is NOT migrated by this,
-- because on the hosts this change exists for, that directory did not survive
-- to be migrated. Re-run the seed to regenerate the demo slips.

-- CreateTable
CREATE TABLE "Screenshot" (
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Screenshot_createdAt_idx" ON "Screenshot"("createdAt");
