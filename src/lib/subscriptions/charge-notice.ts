import type { BillingPeriod } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { formatDateKa, formatMoney } from '@/lib/format';
import { getEmailProvider } from '@/lib/notifications/email';
import { renderEmailHtml } from '@/lib/notifications/email/template';
import { chargeScheduleKa, nextChargeDate } from './charge-schedule';

/**
 * The notice sent after every successful charge on a renewing subscription.
 *
 * The MIT annex requires a customer on a regular payment to be told about the
 * next charge at least four weeks before it happens. A month is never shorter
 * than four weeks, so the one moment that always satisfies it is right after
 * the previous charge: the first payment, and then every renewal. The notice
 * names the amount, the date, the cadence and how to cancel, which is what
 * the annex asks the message to contain.
 *
 * Sent directly rather than through the notification outbox: it is not a
 * preference someone can turn off, and it must not wait behind a daily sweep.
 */

const SIGNATURE = 'DAJDA · dajda.ge';

export type ChargeNoticeContent = { subject: string; text: string; html: string };

export function chargeNoticeEmail(input: {
  planName: string;
  amountMinor: number;
  currency: string;
  period: BillingPeriod;
  nextCharge: Date;
  /** The first payment of the subscription, not a renewal. */
  first: boolean;
  accountUrl: string;
}): ChargeNoticeContent {
  const amount = formatMoney(input.amountMinor, input.currency);
  const date = formatDateKa(input.nextCharge);

  const heading = input.first ? 'გამოწერა აქტიურია' : 'გამოწერა განახლდა';
  const charged = input.first
    ? `${input.planName}: გადახდა მიღებულია, ბარათიდან ჩამოიჭრა ${amount}.`
    : `${input.planName}: გამოწერა ავტომატურად განახლდა, ბარათიდან ჩამოიჭრა ${amount}.`;
  const next = `შემდეგი ჩამოჭრა: ${chargeScheduleKa({
    amountMinor: input.amountMinor,
    currency: input.currency,
    period: input.period,
    nextCharge: input.nextCharge,
  })}, სანამ გამოწერას არ გააუქმებთ.`;
  const cancel =
    'გაუქმება ნებისმიერ დროს შეგიძლიათ პროფილის გვერდიდან. გაუქმების შემდეგ თანხა აღარ ჩამოიჭრება, წვდომა გადახდილი პერიოდის ბოლომდე რჩება.';
  const why = 'ეს შეტყობინება იგზავნება ყოველ ჩამოჭრის შემდეგ.';

  return {
    subject: `DAJDA: ${heading}, შემდეგი ჩამოჭრა ${date}`,
    text: [
      'გამარჯობა,',
      '',
      charged,
      '',
      next,
      '',
      cancel,
      '',
      input.accountUrl,
      '',
      why,
      '',
      SIGNATURE,
    ].join('\n'),
    html: renderEmailHtml({
      heading,
      paragraphs: [charged, next, cancel],
      cta: { label: 'გამოწერის მართვა', url: input.accountUrl },
      footerLines: [why],
    }),
  };
}

/**
 * Send the notice for the subscription an order belongs to. For a renewal,
 * pass the parent order: the renewal's own id is the gateway's, not ours.
 *
 * Never throws. The charge has already happened and been recorded; a mail
 * provider failing must not turn the webhook into a 500 the gateway retries.
 */
export async function sendChargeNotice(orderId: string): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      select: {
        subscription: {
          select: {
            id: true,
            status: true,
            cancelAtPeriodEnd: true,
            cardToken: true,
            user: { select: { email: true } },
            plan: {
              select: { nameKa: true, billingPeriod: true },
            },
          },
        },
      },
    });

    const subscription = payment?.subscription;
    // Only a subscription that will actually be charged again gets told
    // when. No card token means no calendar; a cancellation means none left.
    if (
      !subscription ||
      subscription.cardToken === null ||
      subscription.status !== 'ACTIVE' ||
      subscription.cancelAtPeriodEnd
    ) {
      return;
    }

    // The charge just recorded is the anchor, as the checkout's `new Date()`
    // was for the calendar: its UTC date plus one period is the next charge.
    const charges = await prisma.payment.findMany({
      where: { subscriptionId: subscription.id, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      // The amount charged, not the plan's current price: the gateway's
      // calendar keeps the amount it was opened with.
      select: { createdAt: true, amountMinor: true, currency: true },
      take: 2,
    });
    const latest = charges[0];
    if (!latest) return;

    const { plan } = subscription;
    const content = chargeNoticeEmail({
      planName: plan.nameKa,
      amountMinor: latest.amountMinor,
      currency: latest.currency,
      period: plan.billingPeriod,
      nextCharge: nextChargeDate(latest.createdAt, plan.billingPeriod),
      first: charges.length === 1,
      accountUrl: `${getEnv().APP_URL}/account`,
    });

    const outcome = await getEmailProvider().send({
      to: subscription.user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    if (!outcome.ok) {
      console.error(
        `[dajda] charge notice for subscription ${subscription.id} failed: ${outcome.reason}`,
      );
    }
  } catch (error) {
    console.error(`[dajda] charge notice for order ${orderId} failed`, error);
  }
}
