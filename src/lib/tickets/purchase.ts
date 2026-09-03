import { randomUUID } from "node:crypto";
import { buildReturnUrl } from "@/lib/payments/return-url";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { getPaymentProvider } from "@/lib/payments";
import { abandonRefusedCheckout } from "@/lib/payments/abandon";

/**
 * Buying one paid prediction outright.
 *
 * A paid bet is its own product, apart from the author's subscription: the
 * analyst prices each one when posting, and a buyer takes just that ticket.
 * The mechanics mirror a subscription purchase deliberately: a one-time
 * provider checkout that only a verified webhook completes, so the money
 * paths stay one set of rules.
 */

type Actor = {
  userId: string;
  email: string;
  role: "USER" | "ANALYST" | "ADMIN";
};

export type TicketCheckoutResult =
  | { kind: "PURCHASED" }
  | { kind: "REDIRECT"; checkoutUrl: string; orderId: string };

export async function startTicketPurchase(
  predictionId: string,
  actor: Actor,
): Promise<TicketCheckoutResult> {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    select: {
      id: true,
      titleKa: true,
      visibility: true,
      status: true,
      priceMinor: true,
      publishedAt: true,
      supersededAt: true,
      authorId: true,
      author: { select: { id: true, userId: true } },
    },
  });

  if (
    !prediction ||
    prediction.publishedAt === null ||
    prediction.supersededAt !== null
  ) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "ბილეთი ვერ მოიძებნა.");
  }
  if (prediction.visibility === "PUBLIC") {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "ეს ბილეთი უფასოა.");
  }
  if (prediction.priceMinor === null || prediction.priceMinor <= 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "ამ ბილეთს ცალკე ფასი არ აქვს - ის მხოლოდ გამოწერით იხსნება.",
    );
  }
  // A settled bet is the public record already; there is nothing to sell.
  if (prediction.status !== "PENDING") {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "ბილეთი უკვე დათვლილია და საჯარო ჩანაწერშია.",
    );
  }
  if (prediction.author?.userId === actor.userId) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "საკუთარ ბილეთს ვერ შეიძენთ.",
    );
  }

  const existing = await prisma.predictionPurchase.findUnique({
    where: {
      userId_predictionId: {
        userId: actor.userId,
        predictionId: prediction.id,
      },
    },
    select: { revokedAt: true },
  });
  if (existing && existing.revokedAt === null) {
    throw new AppError(ERROR_CODES.CONFLICT, "ეს ბილეთი უკვე შეძენილია.");
  }

  const priceMinor = prediction.priceMinor;

  const env = getEnv();
  const provider = getPaymentProvider();
  const orderId = `dajda-${randomUUID()}`;

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        userId: actor.userId,
        predictionId: prediction.id,
        purpose: "TICKET",
        providerCode: provider.code,
        providerOrderId: orderId,
        amountMinor: priceMinor,
        currency: "GEL",
        status: "CREATED",
      },
    });

    await writeAuditLog(
      {
        action: AUDIT_ACTIONS.PAYMENT_CREATED,
        entityType: "Payment",
        entityId: orderId,
        summary: `ბილეთის ყიდვა ინიცირებულია: ${prediction.titleKa}`,
        actorId: actor.userId,
        actorRole: actor.role,
        metadata: { predictionId: prediction.id, amountMinor: priceMinor },
      },
      tx,
    );
  });

  let session;
  try {
    session = await provider.createCheckoutSession({
      orderId,
      amountMinor: priceMinor,
      currency: "GEL",
      description: `DAJDA ბილეთი: ${prediction.titleKa}`,
      returnUrl: buildReturnUrl(env.APP_URL, orderId, `/free/${prediction.id}`),
      callbackUrl: `${env.APP_URL}/api/webhooks/payments/${provider.code}`,
      customerEmail: actor.email,
    });
  } catch (error) {
    await abandonRefusedCheckout({
      orderId,
      reason:
        error instanceof AppError && error.internalDetail
          ? error.internalDetail
          : "provider refused to open checkout",
    });
    throw error;
  }

  return { kind: "REDIRECT", checkoutUrl: session.checkoutUrl, orderId };
}
