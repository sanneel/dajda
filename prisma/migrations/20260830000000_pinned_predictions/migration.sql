-- The author can feature up to three bets on their public profile.
ALTER TABLE "Prediction" ADD COLUMN "pinnedAt" TIMESTAMP(3);
