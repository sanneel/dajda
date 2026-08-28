-- Accounts closed before the tombstone rule shipped still hold their email
-- and Google binding hostage (both columns are unique). Apply the same
-- release the close action now performs, so their owners can come back.
UPDATE "User"
SET "email" = 'closed-' || "id" || '@closed.invalid',
    "emailVerifiedAt" = NULL,
    "googleId" = NULL,
    "telegramId" = NULL,
    "telegramChatId" = NULL,
    "telegramUsername" = NULL,
    "telegramLinkedAt" = NULL
WHERE "status" = 'DELETED'
  AND "email" NOT LIKE '%@closed.invalid';
