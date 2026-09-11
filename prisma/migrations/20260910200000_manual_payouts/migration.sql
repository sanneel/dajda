-- Payouts are made by hand, and judged against what the author declared.
--
-- The Flitt contract covers e-commerce acquiring and nothing else: no payout
-- service, and settlement of every transaction to the merchant account within
-- one business day. So an administrator transfers the author's money from that
-- bank account and marks the request paid; paymentReference keeps the bank's
-- reference for the transfer.
--
-- The activity check now reads the author's own declared monthly minimum
-- (agreement 3.5) instead of a fixed weekly quota. declaredMonthlyMinimum keeps
-- the number that applied when the request was made. Nullable, because
-- requests recorded before this were judged by the old rule.
ALTER TABLE "AnalystPayout" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "AnalystPayout" ADD COLUMN "declaredMonthlyMinimum" INTEGER;
