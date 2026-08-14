import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
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
        status: true,
        amountMinor: true,
        currency: true,
        plan: { select: { billingPeriod: true } },
      },
    });

    if (!payment) return null;

    return {
      id: payment.id,
      userId: payment.userId,
      planId: payment.planId,
      subscriptionId: payment.subscriptionId,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      billingPeriod: payment.plan?.billingPeriod ?? null,
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
};
