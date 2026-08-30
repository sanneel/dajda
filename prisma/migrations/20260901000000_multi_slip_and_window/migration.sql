-- A ticket can carry several slip photos, and it can name when its LAST leg
-- starts as well as its first.
--
-- `screenshotPath` stays the primary photo and stays required: every existing
-- row has one, every list and card renders one, and a bet with no evidence is
-- still not a record. The extras are an ordered array beside it, so nothing
-- that reads the primary had to change and no existing row needed rewriting.

ALTER TABLE "Prediction"
  ADD COLUMN "extraScreenshotPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- When the last leg of a multi-match ticket kicks off. Null on a single-match
-- ticket, where `eventAt` already answers the question.
ALTER TABLE "Prediction" ADD COLUMN "eventEndAt" TIMESTAMP(3);
