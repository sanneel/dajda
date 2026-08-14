-- Open posting to any signed-in user.
--
-- `authorId` becomes optional: it links a bet to the analyst whose public
-- record it belongs to, and a community free ticket belongs to nobody's
-- record. `postedById` is new and always present, so "who uploaded this" stays
-- answerable even for rows with no analyst.
--
-- Non-destructive. Every existing bet was posted by an analyst, so the new
-- column is backfilled from the profile's owning user before it is made
-- required; nothing is deleted.
ALTER TABLE "Prediction" ADD COLUMN "postedById" UUID;

UPDATE "Prediction" AS p
SET "postedById" = a."userId"
FROM "AnalystProfile" AS a
WHERE p."authorId" = a."id";

ALTER TABLE "Prediction" ALTER COLUMN "postedById" SET NOT NULL;
ALTER TABLE "Prediction" ALTER COLUMN "authorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Prediction_postedById_publishedAt_idx" ON "Prediction"("postedById", "publishedAt");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
