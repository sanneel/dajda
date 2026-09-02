-- The card an analyst asks to be paid to, sealed at request time and wiped
-- when the request is decided. Before this, only the mask was kept and the
-- administrator had to obtain the full number again by some other channel
-- to release the money - a channel that was never defined, and that would
-- have carried card numbers over chat. Nullable: rows decided before this
-- column existed, and every row once decided, hold nothing here.
ALTER TABLE "AnalystPayout" ADD COLUMN "cardCipher" TEXT;
