-- What the author says happened, recorded when they hand the bet over.
--
-- The settling admin read the slip with no idea what they were looking for.
-- The author knows, so they are now asked: დაჯდა or არ დაჯდა. It stays a
-- claim - status and PredictionResult are still the admin's - and the two
-- disagreeing is exactly what this makes visible.
ALTER TABLE "Prediction" ADD COLUMN "claimedOutcome" "PredictionStatus";
