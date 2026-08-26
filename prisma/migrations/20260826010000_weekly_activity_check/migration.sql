-- The payout activity check moved from a monthly total to a weekly one: a
-- subscriber pays for a month of analysis and receives it as the month goes,
-- and a monthly total cannot tell steady delivery apart from a burst at the
-- end. The request now records how many whole weeks the period held and how
-- many of them reached the minimum.
--
-- Existing rows default to 0/0, which reads as "not judged this way" rather
-- than as a failure; activityCheckPassed on those rows still says what was
-- decided at the time.
ALTER TABLE "AnalystPayout"
  ADD COLUMN "weeksInPeriod" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AnalystPayout"
  ADD COLUMN "weeksMeetingMinimum" INTEGER NOT NULL DEFAULT 0;
