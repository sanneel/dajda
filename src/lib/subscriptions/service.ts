import { randomUUID } from 'node:crypto';
import { buildReturnUrl } from '@/lib/payments/return-url';
import type { BillingPeriod } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { BALANCE_CURRENCY } from '@/lib/balance/service';
import { analystShareMinor, applyEarningsMovement } from '@/lib/balance/ledger';
import { getPaymentProvider } from '@/lib/payments';
import { addBillingPeriod } from '@/lib/payments/webhook';

/** providerCode for a subscription paid out of the balance - no gateway. */
export const BALANCE_PROVIDER_CODE = 'balance';

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
      analystProfile: { select: { userId: true } },
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

  /*
   * A balance that covers the whole price pays first: the money is already
   * on the platform, so there is no gateway, no webhook and no PENDING
   * window - activation is immediate. Anything less than the full price
   * falls through to the ordinary checkout; partial balance payments do not
   * exist, because "you paid 3 GEL of it" has no honest meaning on a card
   * receipt.
   */
  const fromBalance = await activateFromBalance(plan, actor);
  if (fromBalance) {
    return { kind: 'ACTIVATED', subscriptionId: fromBalance.subscriptionId };
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

  /*
   * The gateway manages renewals: the checkout takes the first payment and
   * schedules the next charge for the day this paid period lapses. Each
   * renewal arrives as a webhook naming this order as its parent and extends
   * the subscription without the customer returning. The card token is
   * requested alongside as the fallback for merchant-initiated charges.
   */
  const session = await provider.createCheckoutSession({
    orderId,
    amountMinor: plan.priceMinor,
    currency: plan.currency,
    description: `DAJDA: ${plan.nameKa}`,
    returnUrl: buildReturnUrl(env.APP_URL, orderId, '/dashboard'),
    callbackUrl: `${env.APP_URL}/api/webhooks/payments/${provider.code}`,
    customerEmail: actor.email,
    subscription: {
      every: plan.billingPeriod === 'QUARTERLY' ? 3 : 1,
      period: 'month',
      startDate: addBillingPeriod(new Date(), plan.billingPeriod)
        .toISOString()
        .slice(0, 10),
    },
    requestCardToken: true,
  });

  void subscriptionId;

  return { kind: 'REDIRECT', checkoutUrl: session.checkoutUrl, orderId };
}

/**
 * Debit the plan's price from the balance and activate in one transaction.
 * Returns null - meaning "use the gateway instead" - when the balance cannot
 * cover the full price, including the case where a concurrent purchase spent
 * it between the caller's read and the conditional decrement here.
 */
async function activateFromBalance(
  plan: {
    id: string;
    nameKa: string;
    priceMinor: number;
    currency: string;
    billingPeriod: BillingPeriod;
    analystProfile: { userId: string } | null;
  },
  actor: { userId: string; role: 'USER' | 'ANALYST' | 'ADMIN' },
): Promise<{ subscriptionId: string } | null> {
  // The balance is held in GEL; a plan priced in anything else has no
  // defined exchange rate here and must go through the gateway.
  if (plan.currency !== BALANCE_CURRENCY) return null;

  return prisma.$transaction(async (tx) => {
    // The guard in the WHERE makes overdraft impossible under concurrency:
    // two simultaneous purchases both attempt the decrement, and the row
    // condition lets exactly the affordable ones through.
    const debited = await tx.user.updateMany({
      where: { id: actor.userId, balanceMinor: { gte: plan.priceMinor } },
      data: { balanceMinor: { decrement: plan.priceMinor } },
    });
    if (debited.count === 0) return null;

    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { balanceMinor: true },
    });

    const now = new Date();
    const subscription = await tx.userSubscription.create({
      data: {
        userId: actor.userId,
        planId: plan.id,
        status: 'ACTIVE',
        startedAt: now,
        currentPeriodEnd: addBillingPeriod(now, plan.billingPeriod),
      },
      select: { id: true },
    });

    const payment = await tx.payment.create({
      data: {
        userId: actor.userId,
        planId: plan.id,
        subscriptionId: subscription.id,
        purpose: 'SUBSCRIPTION',
        providerCode: BALANCE_PROVIDER_CODE,
        providerOrderId: `dajda-balance-${randomUUID()}`,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        status: 'SUCCEEDED',
      },
      select: { id: true },
    });

    await tx.paymentStatusTransition.create({
      data: {
        paymentId: payment.id,
        fromStatus: null,
        toStatus: 'SUCCEEDED',
        source: 'SYSTEM',
        reason: 'paid from balance',
      },
    });

    await tx.balanceTransaction.create({
      data: {
        userId: actor.userId,
        kind: 'SUBSCRIPTION_PAYMENT',
        amountMinor: -plan.priceMinor,
        currency: plan.currency,
        balanceAfterMinor: user.balanceMinor,
        paymentId: payment.id,
        note: `გამოწერა: ${plan.nameKa}`,
      },
    });

    if (plan.analystProfile) {
      const share = analystShareMinor(
        plan.priceMinor,
        getEnv().ANALYST_SHARE_PERCENT,
      );
      if (share > 0) {
        await applyEarningsMovement(tx, {
          userId: plan.analystProfile.userId,
          kind: 'ANALYST_EARNING',
          amountMinor: share,
          currency: plan.currency,
          paymentId: payment.id,
          note: 'გამომწერის გადახდიდან კუთვნილი წილი',
        });
      }
    }

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATED,
        entityType: 'UserSubscription',
        entityId: subscription.id,
        summary: `გამოწერა გააქტიურდა ბალანსიდან: ${plan.nameKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: { paymentId: payment.id, paidFromBalance: true },
      },
      tx,
    );

    return { subscriptionId: subscription.id };
  });
}

/**
 * Cancel at period end: the customer keeps the access they already paid for,
 * and nothing renews. This is the behaviour described on the pricing page.
 *
 * With a gateway-managed schedule "nothing renews" is a promise about the
 * gateway, not just our database - so its calendar is stopped first, and a
 * gateway that refuses fails the whole cancellation rather than leaving a
 * customer who believes they canceled being charged next month.
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

  const provider = getPaymentProvider();

  // The order that opened the subscription is the handle on the gateway's
  // renewal calendar. Nothing to stop for free plans or a provider switch.
  const openingPayment = await prisma.payment.findFirst({
    where: {
      subscriptionId: subscription.id,
      providerCode: provider.code,
      status: 'SUCCEEDED',
    },
    orderBy: { createdAt: 'asc' },
    select: { providerOrderId: true },
  });

  if (openingPayment) {
    const stop = await provider.setSubscriptionState({
      orderId: openingPayment.providerOrderId,
      action: 'stop',
    });

    if (stop.status !== 'ACCEPTED') {
      throw new AppError(ERROR_CODES.PAYMENT_ERROR, undefined, {
        internalDetail: `provider refused to stop subscription: ${stop.rawStatus} ${stop.message ?? ''}`,
      });
    }
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
