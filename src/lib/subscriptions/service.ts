import { randomUUID } from "node:crypto";
import { buildReturnUrl } from "@/lib/payments/return-url";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { getPaymentProvider } from "@/lib/payments";
import { abandonRefusedCheckout } from "@/lib/payments/abandon";
import { addBillingPeriod } from "@/lib/payments/webhook";
import { renewalRequest } from "./checkout-rules";
import { recurringBillingEnabled } from "./recurring";
import { expireLapsedSubscriptions } from "./expiry";

/**
 * Subscription lifecycle.
 *
 * A paid subscription is created in PENDING and stays there until a verified
 * webhook says otherwise - this function never returns an activated
 * subscription, no matter what the payment page shows the customer.
 */

export type CheckoutResult =
  | { kind: "ACTIVATED"; subscriptionId: string }
  | { kind: "REDIRECT"; checkoutUrl: string; orderId: string };

export async function startSubscriptionCheckout(
  planId: string,
  actor: { userId: string; email: string; role: "USER" | "ANALYST" | "ADMIN" },
): Promise<CheckoutResult> {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      tier: true,
      nameKa: true,
      priceMinor: true,
      currency: true,
      billingPeriod: true,
      isActive: true,
      analystProfileId: true,
      analystProfile: { select: { userId: true } },
    },
  });

  if (!plan || !plan.isActive) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "გეგმა ვერ მოიძებნა.");
  }

  // A month that has run out still reads ACTIVE until the daily sweep closes
  // it, and only one ACTIVE row per plan is allowed. Close this person's
  // lapsed one first, so paying again on the day it ends works.
  await expireLapsedSubscriptions({ userId: actor.userId, planId: plan.id });

  const existing = await prisma.userSubscription.findFirst({
    where: { userId: actor.userId, planId: plan.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(ERROR_CODES.CONFLICT, "ეს გეგმა უკვე გააქტიურებულია.");
  }

  // A zero-price plan involves no payment provider at all.
  if (plan.priceMinor === 0) {
    const subscription = await prisma.$transaction(async (tx) => {
      const created = await tx.userSubscription.create({
        data: {
          userId: actor.userId,
          planId: plan.id,
          status: "ACTIVE",
          startedAt: new Date(),
          currentPeriodEnd: addBillingPeriod(new Date(), plan.billingPeriod),
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATED,
          entityType: "UserSubscription",
          entityId: created.id,
          summary: `უფასო გეგმა გააქტიურდა: ${plan.nameKa}`,
          actorId: actor.userId,
          actorRole: actor.role,
        },
        tx,
      );

      return created;
    });

    return { kind: "ACTIVATED", subscriptionId: subscription.id };
  }

  const env = getEnv();
  const provider = getPaymentProvider();
  const orderId = `dajda-${randomUUID()}`;

  const { subscriptionId } = await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.create({
      data: { userId: actor.userId, planId: plan.id, status: "PENDING" },
    });

    await tx.payment.create({
      data: {
        userId: actor.userId,
        planId: plan.id,
        subscriptionId: subscription.id,
        providerCode: provider.code,
        providerOrderId: orderId,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        status: "CREATED",
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PAYMENT_CREATED,
        entityType: "Payment",
        entityId: orderId,
        summary: `გადახდა ინიცირებულია: ${plan.nameKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: { planId: plan.id, amountMinor: plan.priceMinor },
      },
      tx,
    );

    return { subscriptionId: subscription.id };
  });

  /*
   * Two ways to sell the same month, chosen by SUBSCRIPTION_RECURRING.
   *
   * On: the checkout takes the first payment and leaves a renewal calendar
   * behind it, scheduled to charge again the day this period lapses. Each
   * renewal arrives as a webhook naming this order as its parent and extends
   * the subscription without the customer returning; the card token is asked
   * for alongside, as the fallback for a merchant-initiated charge. The token
   * is also what every later read - the dashboard's wording, the expiry
   * grace, the cancel path - uses to tell a renewing subscription from a
   * one-off one, so it must be requested whenever a calendar is opened.
   *
   * Off: one month, paid once. No calendar, no token, and continuing means
   * paying again once it ends. This is the default, and stays the default
   * until the gateway confirms the merchant may schedule renewals - see
   * SUBSCRIPTION_RECURRING in lib/env.ts.
   */
  let session;
  try {
    session = await provider.createCheckoutSession({
      orderId,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      description: `DAJDA: ${plan.nameKa}`,
      returnUrl: buildReturnUrl(env.APP_URL, orderId, "/dashboard"),
      callbackUrl: `${env.APP_URL}/api/webhooks/payments/${provider.code}`,
      customerEmail: actor.email,
      ...(renewalRequest(
        recurringBillingEnabled(),
        plan.billingPeriod,
        new Date(),
      ) ?? {}),
    });
  } catch (error) {
    // A refused checkout must not leave a PENDING subscription that blocks
    // the next attempt; see abandonRefusedCheckout.
    await abandonRefusedCheckout({
      orderId,
      subscriptionId,
      reason:
        error instanceof AppError && error.internalDetail
          ? error.internalDetail
          : "provider refused to open checkout",
    });
    throw error;
  }

  return { kind: "REDIRECT", checkoutUrl: session.checkoutUrl, orderId };
}

/**
 * Stop a subscription from renewing. Access stays until the period ends.
 *
 * What needs stopping is the gateway's renewal calendar, and the card token
 * is what says a subscription has one: every checkout that opened a calendar
 * asked for a token in the same breath. So a subscription carrying a token
 * has its calendar stopped first, and a gateway that refuses fails the whole
 * cancellation rather than leaving a customer who believes they canceled
 * being charged next month. A subscription without one - sold while
 * SUBSCRIPTION_RECURRING was off, or on a free plan, or before a provider
 * switch - has nothing to stop at the gateway and simply stops renewing by
 * never having renewed; the dashboard does not offer this for those.
 * Deleting an account also comes through here, for either kind.
 */
export async function cancelSubscription(
  subscriptionId: string,
  actor: { userId: string; role: "USER" | "ANALYST" | "ADMIN" },
) {
  const subscription = await prisma.userSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      userId: true,
      status: true,
      cardToken: true,
      plan: { select: { nameKa: true } },
    },
  });

  if (!subscription) throw new AppError(ERROR_CODES.NOT_FOUND);

  // Ownership check - never trust the id alone.
  if (subscription.userId !== actor.userId && actor.role !== "ADMIN") {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  if (subscription.status !== "ACTIVE") {
    throw new AppError(ERROR_CODES.CONFLICT, "გამოწერა აქტიური არ არის.");
  }

  const provider = getPaymentProvider();

  // The order that opened the subscription is the handle on the gateway's
  // renewal calendar. Only a subscription holding a card token was opened
  // with one; nothing to stop for the rest, for free plans, or after a
  // provider switch.
  const openingPayment =
    subscription.cardToken === null
      ? null
      : await prisma.payment.findFirst({
    where: {
      subscriptionId: subscription.id,
      providerCode: provider.code,
      status: "SUCCEEDED",
    },
    orderBy: { createdAt: "asc" },
    select: { providerOrderId: true },
  });

  if (openingPayment) {
    const stop = await provider.setSubscriptionState({
      orderId: openingPayment.providerOrderId,
      action: "stop",
    });

    if (stop.status !== "ACCEPTED") {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `provider refused to stop subscription: ${stop.rawStatus} ${stop.message ?? ""}`,
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.userSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date(), canceledBy: 'USER' },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELED,
        entityType: "UserSubscription",
        entityId: subscription.id,
        summary: `გამოწერა გაუქმდა პერიოდის ბოლოს: ${subscription.plan.nameKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
      },
      tx,
    );

    return updated;
  });
}
