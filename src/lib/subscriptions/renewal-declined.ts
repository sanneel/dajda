import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { formatDateTimeKa, formatMoney } from '@/lib/format';
import { getPaymentProvider } from '@/lib/payments';
import { getEmailProvider } from '@/lib/notifications/email';
import { renderEmailHtml } from '@/lib/notifications/email/template';
import { notifyAdminsRenewalDeclined } from '@/lib/notifications/admin-alerts';
import type { ChargeNoticeContent } from './charge-notice';

/**
 * What follows a renewal the gateway declined, once the webhook has ended the
 * subscription's calendar (endRenewalCalendar).
 *
 * Three things, each on its own so one failing does not stop the others:
 *
 *   - stop the calendar at the gateway. It does not retry a declined date,
 *     but it does charge the next one (an Apple Pay calendar declined on
 *     2026-09-27 tried again on 09-28), and by then the person has been told
 *     the subscription ended and may well have bought a new one: two
 *     calendars on one plan.
 *   - tell the subscriber. Access runs out at the end of the paid period,
 *     and without a word it looks like the site locked them out.
 *   - tell the administrators. The decline names the gateway's own error,
 *     which is for them to take up with the gateway.
 */

const SIGNATURE = 'DAJDA · dajda.ge';

export function renewalDeclinedEmail(input: {
  planName: string;
  amountMinor: number;
  currency: string;
  /** End of the period already paid for; access stops there. */
  accessEnds: Date | null;
  now: Date;
  /** The gateway accepted the stop, so nothing more can be charged. */
  calendarStopped: boolean;
  resubscribeUrl: string;
}): ChargeNoticeContent {
  const amount = formatMoney(input.amountMinor, input.currency);

  const heading = 'გამოწერა ვერ განახლდა';
  const declined = `${input.planName}: ავტომატური განახლება ვერ შესრულდა, ბარათიდან ${amount} ვერ ჩამოიჭრა.`;
  const ended = input.calendarStopped
    ? 'გამოწერა აღარ განახლდება, შენახული ბარათი წაიშალა და მეტი თანხა არ ჩამოიჭრება.'
    : 'გამოწერა აღარ განახლდება და შენახული ბარათი წაიშალა.';
  const access =
    input.accessEnds && input.accessEnds > input.now
      ? `წვდომა მთავრდება: ${formatDateTimeKa(input.accessEnds)}.`
      : 'წვდომა გადახდილ პერიოდთან ერთად დასრულდა.';
  const again = 'გასაგრძელებლად ხელახლა გამოიწერეთ.';
  const why = 'ეს შეტყობინება იგზავნება, როცა დაგეგმილი ჩამოჭრა ვერ სრულდება.';

  return {
    subject: `DAJDA: ${heading}`,
    text: [
      'გამარჯობა,',
      '',
      declined,
      '',
      ended,
      '',
      access,
      '',
      again,
      input.resubscribeUrl,
      '',
      why,
      '',
      SIGNATURE,
    ].join('\n'),
    html: renderEmailHtml({
      heading,
      paragraphs: [declined, ended, access, again],
      cta: { label: 'ხელახლა გამოწერა', url: input.resubscribeUrl },
      footerLines: [why],
    }),
  };
}

/**
 * Stop the calendar, tell the subscriber and the administrators.
 *
 * Called with the order that opened the calendar, on the one delivery that
 * ended it (RENEWAL_DECLINED), so nothing here is sent twice.
 *
 * Never throws. The decline is recorded and the subscription already closed
 * for renewal; a gateway or mail failure must not turn the webhook into a
 * 500 the gateway retries.
 */
export async function settleDeclinedRenewal(
  parentOrderId: string,
  reason: string,
): Promise<void> {
  let calendarStopped = false;
  try {
    const stop = await getPaymentProvider().setSubscriptionState({
      orderId: parentOrderId,
      action: 'stop',
    });
    calendarStopped = stop.status === 'ACCEPTED';
    if (!calendarStopped) {
      console.error(
        `[dajda] gateway refused to stop the calendar of ${parentOrderId}: ${stop.rawStatus} ${stop.message ?? ''}`,
      );
    }
  } catch (error) {
    console.error(`[dajda] stopping the calendar of ${parentOrderId} failed`, error);
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: parentOrderId },
      select: {
        amountMinor: true,
        currency: true,
        subscription: {
          select: {
            id: true,
            currentPeriodEnd: true,
            user: { select: { email: true } },
            plan: {
              select: {
                nameKa: true,
                analystProfile: { select: { slug: true } },
              },
            },
          },
        },
      },
    });
    const subscription = payment?.subscription;
    if (!payment || !subscription) return;

    const { plan } = subscription;
    const appUrl = getEnv().APP_URL;

    const content = renewalDeclinedEmail({
      planName: plan.nameKa,
      // The amount the calendar was opened with, which is what it tried.
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      accessEnds: subscription.currentPeriodEnd,
      now: new Date(),
      calendarStopped,
      resubscribeUrl: plan.analystProfile
        ? `${appUrl}/analysts/${plan.analystProfile.slug}`
        : `${appUrl}/account`,
    });

    const outcome = await getEmailProvider().send({
      to: subscription.user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    if (!outcome.ok) {
      console.error(
        `[dajda] renewal-declined notice for subscription ${subscription.id} failed: ${outcome.reason}`,
      );
    }

    await notifyAdminsRenewalDeclined({
      planName: plan.nameKa,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reason,
      parentOrderId,
      calendarStopped,
      subscriberNotified: outcome.ok,
    });
  } catch (error) {
    console.error(`[dajda] renewal-declined follow-up for ${parentOrderId} failed`, error);
  }
}
