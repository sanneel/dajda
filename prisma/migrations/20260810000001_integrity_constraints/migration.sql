-- Integrity constraints that Prisma's schema language cannot express.
-- These are database-level guarantees: they hold even if application code is
-- bypassed, which is the whole point of putting them here.

-- ---------------------------------------------------------------------------
-- 1. Exactly one ACTIVE mapping per (provider, sport, label, period).
--    History rows (isActive = false) are unconstrained so the full audit trail
--    survives, but a lookup can never match two live interpretations.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "ProviderMarketMapping_active_key"
  ON "ProviderMarketMapping" ("providerId", "sportId", "normalizedLabel", "period")
  WHERE "isActive" = true;

-- ---------------------------------------------------------------------------
-- 2. A user may hold only one ACTIVE subscription per plan. Prevents a double
--    webhook or a repeated checkout from stacking entitlements.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "UserSubscription_active_key"
  ON "UserSubscription" ("userId", "planId")
  WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. A published prediction must be fully specified. NEEDS_REVIEW mappings and
--    unmapped markets can exist as drafts but must never reach the public feed.
-- ---------------------------------------------------------------------------
ALTER TABLE "Prediction"
  ADD CONSTRAINT "Prediction_published_requires_resolution"
  CHECK (
    "publishedAt" IS NULL
    OR ("resolutionStatus" = 'RESOLVED' AND "canonicalMarketId" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 4. Odds must be greater than 1.000 and a stake must be positive. Guards the
--    ROI arithmetic against values that would make the record meaningless.
-- ---------------------------------------------------------------------------
ALTER TABLE "Prediction"
  ADD CONSTRAINT "Prediction_odds_positive" CHECK ("oddsMilli" > 1000);

ALTER TABLE "Prediction"
  ADD CONSTRAINT "Prediction_stake_positive" CHECK ("stakeUnitsCenti" > 0);

-- ---------------------------------------------------------------------------
-- 5. A settled result may never carry PENDING as its outcome.
-- ---------------------------------------------------------------------------
ALTER TABLE "PredictionResult"
  ADD CONSTRAINT "PredictionResult_outcome_is_terminal"
  CHECK ("outcome" <> 'PENDING');

-- ---------------------------------------------------------------------------
-- 6. Payments must be for a positive amount.
-- ---------------------------------------------------------------------------
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0);

-- ---------------------------------------------------------------------------
-- 7. A report must point at exactly the target its type declares.
-- ---------------------------------------------------------------------------
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_target_matches_type"
  CHECK (
    ("targetType" = 'ANALYST'    AND "analystProfileId" IS NOT NULL AND "predictionId" IS NULL)
    OR
    ("targetType" = 'PREDICTION' AND "predictionId" IS NOT NULL AND "analystProfileId" IS NULL)
  );
