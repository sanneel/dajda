-- Gateway-issued reusable card token (Flitt rectoken) for merchant-initiated
-- recurring charges, plus its validity as reported by the gateway. The token
-- is opaque - never a PAN - so plain TEXT columns are appropriate.
ALTER TABLE "UserSubscription" ADD COLUMN "cardToken" TEXT;
ALTER TABLE "UserSubscription" ADD COLUMN "cardTokenLifetime" TEXT;
