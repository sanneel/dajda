-- An administrator's override of the withdrawal calendar, one author at a
-- time. The agreement's rule (the last day of the month) stays the default;
-- OPEN releases the money today whatever the date, CLOSED holds it back even
-- on the last day. The reason is stored with it, because the next
-- administrator reading the row should not have to guess why.
CREATE TYPE "PayoutWindow" AS ENUM ('SCHEDULE', 'OPEN', 'CLOSED');

ALTER TABLE "AnalystProfile"
  ADD COLUMN "payoutWindow" "PayoutWindow" NOT NULL DEFAULT 'SCHEDULE',
  ADD COLUMN "payoutWindowNote" TEXT,
  ADD COLUMN "payoutWindowSetAt" TIMESTAMP(3);
