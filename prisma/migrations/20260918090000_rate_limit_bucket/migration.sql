-- Rate limit counters move from process memory to the database.
--
-- The app runs as many short-lived instances, and each kept its own counter,
-- so a limit of eight login attempts was eight per instance. One table, one
-- counter per key and window, shared by every instance.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStartMs" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAtMs" BIGINT NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStartMs")
);

CREATE INDEX "RateLimitBucket_expiresAtMs_idx" ON "RateLimitBucket"("expiresAtMs");
