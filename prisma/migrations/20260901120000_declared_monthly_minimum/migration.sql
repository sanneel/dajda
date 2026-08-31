-- Clause 6.4: an author declares, when applying, the smallest number of
-- predictions they will publish per calendar month, and that number must be
-- visible on their page BEFORE a subscription is bought.
--
-- Nullable, because every profile approved before this rule existed has not
-- declared one. The UI prints a dash rather than inventing a promise on their
-- behalf; new applications require it.
ALTER TABLE "AnalystProfile" ADD COLUMN "monthlyMinimum" INTEGER;
