-- Who closed a subscription. The webhook needs to tell a row the subscriber
-- cancelled from one the payment closed before it was ever active: only the
-- second may be reopened when a declined order is approved on a retry.
CREATE TYPE "SubscriptionCanceledBy" AS ENUM ('USER', 'SYSTEM', 'PAYMENT');

ALTER TABLE "UserSubscription"
  ADD COLUMN "canceledBy" "SubscriptionCanceledBy";

-- Existing rows: a subscriber's cancellation always stamped canceledAt; the
-- refused-checkout path never did.
UPDATE "UserSubscription"
  SET "canceledBy" = CASE WHEN "canceledAt" IS NULL THEN 'SYSTEM' ELSE 'USER' END::"SubscriptionCanceledBy"
  WHERE "status" = 'CANCELED' AND "canceledBy" IS NULL;
