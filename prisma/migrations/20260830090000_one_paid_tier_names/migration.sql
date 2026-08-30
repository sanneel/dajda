-- One paid tier as far as readers are concerned: existing plan names drop
-- the tier suffix. Data-only; the enums stay for rows already published.
UPDATE "SubscriptionPlan"
SET "nameKa" = REPLACE(REPLACE("nameKa", ' · Premium', ' · გამოწერა'), ' · VIP', ' · გამოწერა');
