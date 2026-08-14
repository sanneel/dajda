import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';
import { addBillingPeriod } from '@/lib/payments/webhook';

/**
 * Subscription lifecycle.
 *
 * A paid subscription is created in PENDING and stays there until a verified
 * webhook says otherwise - this function never returns an activated
 * subscription, no matter what the payment page shows the customer.
 */

export type CheckoutResult =
  | { kind: 'ACTIVATED'; subscriptionId: string }
  | { kind: 'REDIRECT'; checkoutUrl: string; orderId: string };

export async function startSubscriptionCheckout(
  planId: string,
  actor: { userId: string; email: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
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
    },
  });

  if (!plan || !plan.isActive) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'გეგმა ვერ მოიძებნა.');
  }

  const existing = await prisma.userSubscription.findFirst({
    where: { userId: actor.userId, planId: plan.id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(ERROR_CODES.CONFLICT, 'ეს გეგმა უკვე გააქტიურებულია.');
  }

  // A zero-price plan involves no payment provider at all.
  if (plan.priceMinor === 0) {
    const subscription = await prisma.$transaction(async (tx) => {
      const created = await tx.userSubscription.create({
        data: {
          userId: actor.userId,
          planId: plan.id,
          status: 'ACTIVE',
          startedAt: new Date(),
          currentPeriodEnd: addBillingPeriod(new Date(), plan.billingPeriod),
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATED,
          entityType: 'UserSubscription',
          entityId: created.id,
          summary: `უფასო გეგმა გააქტიურდა: ${plan.nameKa}`,
          actorId: actor.userId,
          actorRole: actor.role,
        },
        tx,
      );

      return created;
    });

    return { kind: 'ACTIVATED', subscriptionId: subscription.id };
  }

  const env = getEnv();
  const provider = getPaymentProvider();
  const orderId = `dajda-${randomUUID()}`;

  const { subscriptionId } = await prisma.$transaction(async (tx) => {
    const subscription = await tx.userSubscription.create({
      data: { userId: actor.userId, planId: plan.id, status: 'PENDING' },
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
        status: 'CREATED',
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PAYMENT_CREATED,
        entityType: 'Payment',
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

  const session = await provider.createCheckoutSession({
    orderId,
    amountMinor: plan.priceMinor,
    currency: plan.currency,
    description: `DAJDA: ${plan.nameKa}`,
    returnUrl: `${env.APP_URL}/dashboard?order=${orderId}`,
    callbackUrl: `${env.APP_URL}/api/webhooks/payments/${provider.code}`,
    customerEmail: actor.email,
  });

  void subscriptionId;

  return { kind: 'REDIRECT', checkoutUrl: session.checkoutUrl, orderId };
}

/**
 * Cancel at period end: the customer keeps the access they already paid for,
 * and nothing renews. This is the behaviour described on the pricing page.
 */
export async function cancelSubscription(
  subscriptionId: string,
  actor: { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
) {
  const subscription = await prisma.userSubscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, userId: true, status: true, plan: { select: { nameKa: true } } },
  });

  if (!subscription) throw new AppError(ERROR_CODES.NOT_FOUND);

  // Ownership check - never trust the id alone.
  if (subscription.userId !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(ERROR_CODES.FORBIDDEN);
  }
  if (subscription.status !== 'ACTIVE') {
    throw new AppError(ERROR_CODES.CONFLICT, 'გამოწერა აქტიური არ არის.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.userSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELED,
        entityType: 'UserSubscription',
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
