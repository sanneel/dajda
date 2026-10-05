-- Say outright which subscriptions have a renewal calendar at the gateway.
--
-- Until now the card token stood for the calendar. The gateway does not always
-- return a token with the first charge, and a subscription opened that way
-- renewed by itself while the product treated it as a single month: no cancel
-- button, and a cancellation that never reached the gateway.
ALTER TABLE "UserSubscription" ADD COLUMN "renewalOrderId" TEXT;

-- Backfill: the order that opened the subscription, for every one that still
-- renews. Evidence of a calendar is any of: a card token, a renewal the gateway
-- already charged (its order names the parent), or the card consent the
-- checkout records only when it opens a calendar. Left out: anything the
-- subscriber or an administrator canceled, and calendars a declined renewal
-- ended, unless the gateway charged again after that decline (an Apple Pay
-- calendar declined on 2026-09-27 charged on 09-28, so it was still running).
WITH opening AS (
  SELECT DISTINCT ON (p."subscriptionId") p."subscriptionId", p."providerOrderId"
    FROM "Payment" p
   WHERE p."subscriptionId" IS NOT NULL
     AND p.status IN ('SUCCEEDED', 'REFUNDED')
     AND p."providerOrderId" NOT LIKE 'recurring\_\_%'
   ORDER BY p."subscriptionId", p."createdAt" ASC
)
UPDATE "UserSubscription" s
   SET "renewalOrderId" = o."providerOrderId"
  FROM opening o
 WHERE o."subscriptionId" = s.id
   AND s.status IN ('ACTIVE', 'PAST_DUE', 'EXPIRED')
   AND s."cancelAtPeriodEnd" = false
   AND s."canceledAt" IS NULL
   AND (
     s."cardToken" IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM "Payment" r
        WHERE r."subscriptionId" = s.id
          AND r."providerOrderId" LIKE 'recurring\_\_%'
     )
     OR EXISTS (
       SELECT 1 FROM "AuditLog" a
        WHERE a.action = 'payment.created'
          AND a."entityId" = o."providerOrderId"
          AND a.metadata ? 'cardConsentAt'
     )
   )
   AND NOT EXISTS (
     SELECT 1 FROM "AuditLog" a
      WHERE a.action = 'subscription.renewal_failed'
        AND a."entityId" = s.id::text
        AND a."createdAt" > COALESCE(
          (SELECT max(r."createdAt") FROM "Payment" r
            WHERE r."subscriptionId" = s.id
              AND r."providerOrderId" LIKE 'recurring\_\_%'),
          '-infinity'::timestamp
        )
   );
