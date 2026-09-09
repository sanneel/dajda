-- The author's face, shown wherever their name is.
--
-- Nullable, because the profiles approved before this rule exist and cannot
-- retroactively produce a photograph. New applications require one, which is
-- enforced where the application is accepted rather than by the column: an
-- admin correcting an old profile must not be blocked by it.
ALTER TABLE "AnalystProfile" ADD COLUMN "photoPath" TEXT;
