import { prisma } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payments';
import { prismaWebhookPort } from './prisma-port';
import { processPaymentWebhook, type ProcessAction } from './webhook';
import { STALE_CHECKOUT_MS, sweepResult } from './sweep-rules';
import type { PaymentVerification } from './types';

/**
 * Checkouts the gateway never told us about.
 *
 * A payment row is written before the gateway's page opens. If the buyer
 * closes the tab, or the callback is lost, the row sits in CREATED and its
 * subscription in PENDING with nothing scheduled to ever change them. This
 * sweep asks the gateway what became of each such order once it is a day
 * old, and feeds the answer through the same webhook rules as a callback:
 * a late approval still checks the amount, still activates exactly once;
 * anything else closes the order as EXPIRED and, with it, the pending
 * subscription. The decisions live in sweep-rules.ts.
 */

export type SweepReport = {
  examined: number;
  /** How each order ended, keyed by the webhook action. */
  outcomes: Partial<Record<ProcessAction, number>>;
  /** Orders the gateway could not be asked about this time; next run retries. */
  unreachable: number;
};

export async function sweepStaleCheckouts(input: {
  now?: Date;
  limit?: number;
} = {}): Promise<SweepReport> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 50;
  const provider = getPaymentProvider();

  const stale = await prisma.payment.findMany({
    where: {
      providerCode: provider.code,
      status: { in: ['CREATED', 'PROCESSING'] },
      createdAt: { lt: new Date(now.getTime() - STALE_CHECKOUT_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { providerOrderId: true },
  });

  const report: SweepReport = { examined: stale.length, outcomes: {}, unreachable: 0 };

  for (const row of stale) {
    let verification: PaymentVerification;
    try {
      verification = await provider.verifyPayment({ orderId: row.providerOrderId });
    } catch (error) {
      report.unreachable += 1;
      console.warn('[dajda] sweep: gateway status check failed', row.providerOrderId, error);
      continue;
    }

    const outcome = await processPaymentWebhook(
      provider.code,
      sweepResult(row.providerOrderId, verification, now),
      prismaWebhookPort,
      now,
    );
    report.outcomes[outcome.action] = (report.outcomes[outcome.action] ?? 0) + 1;
  }

  return report;
}
