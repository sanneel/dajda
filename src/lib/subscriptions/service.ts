import { randomUUID } from "node:crypto";
import { buildReturnUrl } from "@/lib/payments/return-url";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { getPaymentProvider } from "@/lib/payments";
import { abandonRefusedCheckout } from "@/lib/payments/abandon";
import { addBillingPeriod } from "@/lib/payments/webhook";
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
   * One month, paid once. The contract with the payment provider covers
   * taking payments and nothing that charges a card again on its own, so the
   * checkout opens no renewal calendar and asks for no reusable card token.
   * The month is set when the payment is confirmed, and continuing means
   * paying again once it ends.
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
 * Subscriptions bought now do not renew, so for them there is nothing to stop
 * and the dashboard does not offer this. It remains for one bought while
 * checkouts still opened a renewal calendar at the gateway, which is the one
 * that carries a card token: that calendar is stopped first, and a gateway
 * that refuses fails the whole cancellation rather than leaving a customer
 * who believes they canceled being charged next month. Deleting an account
 * also comes through here, for either kind.
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
