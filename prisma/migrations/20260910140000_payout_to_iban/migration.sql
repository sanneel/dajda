-- Payouts move off cards and onto bank accounts.
--
-- Flitt has no card payout we can use. /api/p2pcredit credits a card only
-- through a `receiver_rectoken` issued by an earlier purchase on that same
-- card: "Withdrawal can be performed only after initial purchase with the
-- rectoken". There is no documented parameter for a raw card number, which is
-- what this application had been sending, and the gateway answers 1074 "P2P
-- credit allowed only by rectoken". The rail also wants a merchant IP allowlist
-- (1099) and is country-restricted (1090).
--
-- That shape is wrong for an author anyway. It credits a card that has already
-- paid this merchant, and an author is owed their earnings rather than refunded
-- a purchase; most of them have never bought anything here. /api/ibancredit
-- needs no prior purchase, settles in GEL and takes an IBAN.
--
-- Renamed rather than replaced: the column has always meant "where the money
-- goes", and the payouts already recorded under it are still that. Their masks
-- stay card masks, which is what was true when they were written.
ALTER TABLE "AnalystPayout" RENAME COLUMN "maskedCard" TO "maskedAccount";
ALTER TABLE "AnalystPayout" RENAME COLUMN "cardCipher" TO "accountCipher";
