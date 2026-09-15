-- A one-day billing period, for testing renewals on a live card.
--
-- A monthly renewal takes a month to observe. An administrator can put one
-- author's plan on DAILY, so the gateway's calendar charges the next day and
-- the subscription is extended by a day. Authors never choose it.
ALTER TYPE "BillingPeriod" ADD VALUE 'DAILY';
