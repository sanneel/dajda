import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { analystShareMinor, applyEarningsMovement } from '@/lib/balance/ledger';
import { getEnv } from '@/lib/env';
// Every amount in this file is in minor units. Audit summaries are read by a
// person, so they go through the formatter: "+1615 GEL" is a different
// number from "+16.15 ₾", and the audit log once said the first.
import { formatMoney } from '@/lib/format';
import type { PaymentSnapshot, WebhookPort } from './webhook';

/** Prisma unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Production WebhookPort.
 *
 * Idempotency is enforced by the database, not by a read-then-write check:
 * two concurrent deliveries of the same event both attempt the insert and
 * exactly one wins the unique index on (providerCode, eventId).
 */
export const prismaWebhookPort: WebhookPort = {
  async recordEvent(input) {
    try {
      const created = await prisma.webhookEvent.create({
        data: {
          providerCode: input.providerCode,
          eventId: input.eventId,
          signatureValid: input.signatureValid,
          payload: input.payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { id: created.id, duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      /*
       * The unique index on (providerCode, eventId) rejected the insert, so
       * this delivery has already been recorded and decided. The caller stops
       * immediately on `duplicate`, and never uses the id, so there is no need
       * to re-read the existing row - skipping it removes a query and a
       * failure mode from the hot path of a retrying gateway.
       */
      return { id: '', duplicate: true };
    }
  },

  async markProcessed(eventRowId, result) {
    if (!eventRowId) return;
    await prisma.webhookEvent.update({
      where: { id: eventRowId },
      data: { processedAt: new Date(), processingResult: result.slice(0, 500) },
    });
  },

  async findPaymentByOrderId(orderId): Promise<PaymentSnapshot | null> {
    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      select: {
        id: true,
        userId: true,
        planId: true,
        subscriptionId: true,
        purpose: true,
        status: true,
        amountMinor: true,
        currency: true,
        plan: {
          select: {
            billingPeriod: true,
            analystProfileId: true,
            analystProfile: { select: { userId: true } },
          },
        },
        predictionId: true,
        prediction: {
          select: { author: { select: { id: true, userId: true } } },
        },
      },
    });

    if (!payment) return null;

    return {
      id: payment.id,
      userId: payment.userId,
      planId: payment.planId,
      subscriptionId: payment.subscriptionId,
      purpose: payment.purpose,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      billingPeriod: payment.plan?.billingPeriod ?? null,
      predictionId: payment.predictionId,
      // A subscription payment names its analyst through the plan, a ticket
      // payment through the prediction's author.
      analystProfileId:
        payment.plan?.analystProfileId ??
        payment.prediction?.author?.id ??
        null,
      analystUserId:
        payment.plan?.analystProfile?.userId ??
        payment.prediction?.author?.userId ??
        null,
    };
  },

  async transitionPayment(input) {
    await prisma.$transaction(async (tx) => {
      // The status guard makes a concurrent double-apply a no-op.
      const updated = await tx.payment.updateMany({
        where: { id: input.paymentId, status: input.from },
        data: {
          status: input.to,
          providerPaymentId: input.providerPaymentId ?? undefined,
          maskedCard: input.maskedCard ?? undefined,
          cardType: input.cardType ?? undefined,
          rrn: input.rrn ?? undefined,
        },
      });

      if (updated.count === 0) return;

      await tx.paymentStatusTransition.create({
        data: {
          paymentId: input.paymentId,
          fromStatus: input.from,
          toStatus: input.to,
          source: 'WEBHOOK',
          reason: input.reason,
          webhookEventId: input.webhookEventId || null,
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED,
          entityType: 'Payment',
          entityId: input.paymentId,
          summary: `გადახდის სტატუსი: ${input.from} → ${input.to}`,
          metadata: { source: 'WEBHOOK', reason: input.reason },
        },
        tx,
      );
    });
  },

  async activateSubscription(input) {
    await prisma.$transaction(async (tx) => {
      /*
       * One ACTIVE subscription per user and plan, enforced by a partial
       * unique index. A second verified payment for a plan the user already
       * holds - two checkouts opened in two tabs, a gateway retry after a
       * rename - must not crash here: the money is captured, and a 500
       * makes the gateway retry the same failure forever. It is folded into
       * the running subscription instead: that one gains the paid period,
       * and the pending row is closed. Checked before the update rather
       * than caught after it, because a failed statement aborts the whole
       * Postgres transaction.
       */
      const pending = await tx.userSubscription.findUnique({
        where: { id: input.subscriptionId },
        select: { planId: true, status: true },
      });
      if (!pending || pending.status === 'ACTIVE') return;

      const running = await tx.userSubscription.findFirst({
        where: {
          userId: input.userId,
          planId: pending.planId,
          status: 'ACTIVE',
          id: { not: input.subscriptionId },
        },
        select: { id: true, currentPeriodEnd: true },
      });

      if (running) {
        const now = new Date();
        const paidPeriodMs = input.currentPeriodEnd.getTime() - now.getTime();
        const base =
          running.currentPeriodEnd && running.currentPeriodEnd > now
            ? running.currentPeriodEnd
            : now;
        const extendedEnd = new Date(base.getTime() + Math.max(paidPeriodMs, 0));

        await tx.userSubscription.update({
          where: { id: running.id },
          data: {
            currentPeriodEnd: extendedEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        });
        await tx.userSubscription.update({
          where: { id: input.subscriptionId },
          data: { status: 'CANCELED', canceledAt: now },
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATED,
            entityType: 'UserSubscription',
            entityId: running.id,
            summary:
              'განმეორებითი გადახდა უკვე აქტიურ გამოწერას დაემატა: პერიოდი გაგრძელდა',
            actorId: input.userId,
            metadata: {
              paymentId: input.paymentId,
              supersededSubscriptionId: input.subscriptionId,
              currentPeriodEnd: extendedEnd.toISOString(),
            },
          },
          tx,
        );
        return;
      }

      const updated = await tx.userSubscription.updateMany({
        where: {
          id: input.subscriptionId,
          userId: input.userId,
          status: { in: ['PENDING', 'PAST_DUE', 'EXPIRED'] },
        },
        data: {
          status: 'ACTIVE',
          startedAt: new Date(),
          currentPeriodEnd: input.currentPeriodEnd,
          canceledAt: null,
          cancelAtPeriodEnd: false,
        },
      });

      // Already ACTIVE from an earlier delivery - nothing more to do.
      if (updated.count === 0) return;

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATED,
          entityType: 'UserSubscription',
          entityId: input.subscriptionId,
          summary: 'გამოწერა გააქტიურდა დადასტურებული გადახდის შემდეგ',
          actorId: input.userId,
          metadata: {
            paymentId: input.paymentId,
            currentPeriodEnd: input.currentPeriodEnd.toISOString(),
          },
        },
        tx,
      );
    });
  },

  async deactivateSubscription(input) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.userSubscription.updateMany({
        where: { id: input.subscriptionId, status: 'ACTIVE' },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });

      if (updated.count === 0) return;

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELED,
          entityType: 'UserSubscription',
          entityId: input.subscriptionId,
          summary: `გამოწერა შეწყდა: ${input.reason}`,
        },
        tx,
      );
    });
  },

  async saveCardToken(input) {
    // The ownership condition makes a webhook that names a mismatched
    // (subscription, user) pair a silent no-op rather than a token overwrite.
    await prisma.userSubscription.updateMany({
      where: { id: input.subscriptionId, userId: input.userId },
      data: {
        cardToken: input.cardToken,
        cardTokenLifetime: input.cardTokenLifetime,
      },
    });
  },

  async recordRenewalPayment(input) {
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            userId: input.userId,
            planId: input.planId,
            subscriptionId: input.subscriptionId,
            providerCode: input.providerCode,
            providerOrderId: input.orderId,
            providerPaymentId: input.providerPaymentId,
            amountMinor: input.amountMinor,
            currency: input.currency,
            status: 'SUCCEEDED',
            maskedCard: input.maskedCard ?? undefined,
            cardType: input.cardType ?? undefined,
            rrn: input.rrn ?? undefined,
          },
          select: { id: true },
        });

        await tx.paymentStatusTransition.create({
          data: {
            paymentId: created.id,
            fromStatus: null,
            toStatus: 'SUCCEEDED',
            source: 'WEBHOOK',
            reason: `gateway-scheduled renewal of payment ${input.parentPaymentId}`,
            webhookEventId: input.webhookEventId || null,
          },
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED,
            entityType: 'Payment',
            entityId: created.id,
            summary: 'განმეორებადი გადახდა შესრულდა (გეგმის განახლება)',
            metadata: {
              source: 'WEBHOOK',
              parentPaymentId: input.parentPaymentId,
              subscriptionId: input.subscriptionId,
            },
          },
          tx,
        );

        return { paymentId: created.id };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same renewal order arrived under a different event id; the
      // unique index on providerOrderId already holds the record. Reporting
      // no payment id keeps the caller from crediting the analyst twice.
      return { paymentId: null };
    }
  },

  async grantTicketPurchase(input) {
    await prisma.predictionPurchase.upsert({
      where: {
        userId_predictionId: {
          userId: input.userId,
          predictionId: input.predictionId,
        },
      },
      create: {
        userId: input.userId,
        predictionId: input.predictionId,
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      // A re-delivered success or a re-bought revoked ticket simply comes
      // back; the upsert makes both arrivals the same statement.
      update: {
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        revokedAt: null,
      },
    });

    await writeAuditLog({
      action: AUDIT_ACTIONS.TICKET_PURCHASED,
      entityType: 'Prediction',
      entityId: input.predictionId,
      summary: 'ბილეთი შეძენილია გადახდით',
      actorId: input.userId,
      metadata: { paymentId: input.paymentId },
    });
  },

  async revokeTicketPurchase(input) {
    await prisma.predictionPurchase.updateMany({
      where: {
        userId: input.userId,
        predictionId: input.predictionId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      action: AUDIT_ACTIONS.TICKET_PURCHASE_REVOKED,
      entityType: 'Prediction',
      entityId: input.predictionId,
      summary: `ბილეთზე წვდომა შეწყდა: ${input.reason}`,
      actorId: input.userId,
    });
  },

  async creditAnalystEarning(input) {
    const share = analystShareMinor(
      input.grossAmountMinor,
      getEnv().ANALYST_SHARE_PERCENT,
    );
    // A share that rounds to nothing is not a movement. The ledger refuses a
    // zero row by constraint, and writing one would be noise anyway.
    if (share <= 0) return;

    try {
      await prisma.$transaction(async (tx) => {
        const { earningsAfterMinor } = await applyEarningsMovement(tx, {
          userId: input.analystUserId,
          kind: 'ANALYST_EARNING',
          amountMinor: share,
          currency: input.currency,
          paymentId: input.paymentId,
          note: 'გამომწერის გადახდიდან კუთვნილი წილი',
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.BALANCE_CREDITED,
            entityType: 'AnalystProfile',
            entityId: input.analystProfileId,
            summary: `ანალიტიკოსს დაერიცხა: +${formatMoney(share, input.currency)}`,
            metadata: {
              account: 'EARNINGS',
              paymentId: input.paymentId,
              grossAmountMinor: input.grossAmountMinor,
              earningsAfterMinor,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // (paymentId, kind) says this payment has already earned once.
    }
  },

  async reverseAnalystEarning(input) {
    const share = analystShareMinor(
      input.grossAmountMinor,
      getEnv().ANALYST_SHARE_PERCENT,
    );
    if (share <= 0) return;

    try {
      await prisma.$transaction(async (tx) => {
        const { earningsAfterMinor } = await applyEarningsMovement(tx, {
          userId: input.analystUserId,
          kind: 'ANALYST_EARNING_REVERSAL',
          amountMinor: -share,
          currency: input.currency,
          paymentId: input.paymentId,
          note: input.reason,
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.BALANCE_DEBITED,
            entityType: 'User',
            entityId: input.analystUserId,
            summary: `ანალიტიკოსს ჩამოეჭრა დაბრუნებული გადახდის წილი: ${formatMoney(share, input.currency)}`,
            metadata: {
              account: 'EARNINGS',
              paymentId: input.paymentId,
              reason: input.reason,
              earningsAfterMinor,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Already reversed once for this payment.
    }
  },

  async creditBalanceTopUp(input) {
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: input.userId },
          data: { balanceMinor: { increment: input.amountMinor } },
          select: { balanceMinor: true },
        });

        await tx.balanceTransaction.create({
          data: {
            userId: input.userId,
            kind: 'TOPUP',
            amountMinor: input.amountMinor,
            currency: input.currency,
            balanceAfterMinor: user.balanceMinor,
            paymentId: input.paymentId,
            note: 'ბალანსის შევსება დადასტურებული გადახდით',
          },
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.BALANCE_CREDITED,
            entityType: 'User',
            entityId: input.userId,
            summary: `ბალანსი შეივსო: +${formatMoney(input.amountMinor, input.currency)}`,
            actorId: input.userId,
            metadata: { paymentId: input.paymentId },
          },
          tx,
        );
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      /*
       * The (paymentId, kind) unique index says this payment already credited
       * the balance once - and the increment above rolled back with the same
       * transaction, so a redelivery leaves the cache untouched too.
       */
    }
  },

  async reverseBalanceTopUp(input) {
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: input.userId },
          data: { balanceMinor: { decrement: input.amountMinor } },
          select: { balanceMinor: true },
        });

        await tx.balanceTransaction.create({
          data: {
            userId: input.userId,
            kind: 'TOPUP_REVERSAL',
            amountMinor: -input.amountMinor,
            currency: input.currency,
            balanceAfterMinor: user.balanceMinor,
            paymentId: input.paymentId,
            note: input.reason,
          },
        });

        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.BALANCE_DEBITED,
            entityType: 'User',
            entityId: input.userId,
            summary: `ბალანსიდან ჩამოიჭრა დაბრუნებული შევსება: -${formatMoney(input.amountMinor, input.currency)}`,
            metadata: { paymentId: input.paymentId, reason: input.reason },
          },
          tx,
        );
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Already reversed once; see creditBalanceTopUp.
    }
  },

  async renewSubscription(input) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.userSubscription.updateMany({
        where: {
          id: input.subscriptionId,
          userId: input.userId,
          // CANCELED stays canceled: money taken after a cancellation is a
          // dispute to resolve by refund, not a reason to reopen access.
          status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'EXPIRED'] },
        },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: input.currentPeriodEnd,
        },
      });

      if (updated.count === 0) return;

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.SUBSCRIPTION_RENEWED,
          entityType: 'UserSubscription',
          entityId: input.subscriptionId,
          summary: 'გამოწერა განახლდა დაგეგმილი გადახდით',
          actorId: input.userId,
          metadata: { currentPeriodEnd: input.currentPeriodEnd.toISOString() },
        },
        tx,
      );
    });
  },
};
