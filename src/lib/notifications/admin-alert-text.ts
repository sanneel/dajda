import { formatDateTimeKa, formatMoney, formatOdds } from '@/lib/format';

/**
 * The wording of administrator alerts, apart from the database and the bot
 * so a test can pin it down. `admin-alerts.ts` is the side that sends.
 */

export type BetFinishedAlertInput = {
  predictionId: string;
  titleKa: string;
  authorName: string;
  sportName: string;
  oddsMilli: number;
  eventAt: Date | null;
  hasResultScreenshot: boolean;
};

/** Where the message points: the review queue, filtered to what is waiting. */
export const SETTLEMENT_QUEUE_PATH = '/admin/predictions?review=awaiting';

/**
 * The text, kept pure so the wording can be pinned down in a test without a
 * database or a bot.
 */
export function renderBetFinishedAlert(input: BetFinishedAlertInput): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  const lines = [
    `${input.authorName} მონიშნა ფსონი დასრულებულად. შეამოწმეთ შედეგი და დაითვალეთ.`,
    '',
    `სპორტი: ${input.sportName}`,
    `კოეფიციენტი: ${formatOdds(input.oddsMilli)}`,
    input.eventAt ? `მატჩი: ${formatDateTimeKa(input.eventAt)}` : null,
    `შედეგის სკრინი: ${input.hasResultScreenshot ? 'თან ერთვის' : 'არ არის'}`,
  ].filter((line): line is string => line !== null);

  return {
    subjectKa: `დასათვლელია: ${input.titleKa}`,
    bodyKa: lines.join('\n'),
    linkPath: SETTLEMENT_QUEUE_PATH,
  };
}

export type PayoutRequestedAlertInput = {
  authorName: string;
  amountMinor: number;
  currency: string;
  maskedAccount: string;
  activityCheckPassed: boolean;
};

/** Where the message points: the payout queue, where the full IBAN is. */
export const PAYOUT_QUEUE_PATH = '/admin/payouts';

/**
 * An author asked to be paid. The money moves only when an administrator
 * transfers it from the bank, so the message says how much, to whose account,
 * and whether the month's delivery check passed.
 *
 * The account is masked on purpose. The full IBAN stays on the payouts page,
 * behind the admin login, rather than sitting in a Telegram chat.
 */
export function renderPayoutRequestedAlert(input: PayoutRequestedAlertInput): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  const amount = formatMoney(input.amountMinor, input.currency);
  const lines = [
    `${input.authorName} ითხოვს გატანას: ${amount}.`,
    '',
    `ანგარიში: ${input.maskedAccount}`,
    `აქტივობის შემოწმება: ${
      input.activityCheckPassed ? 'გავლილია' : 'ვერ გაიარა, გადაამოწმეთ'
    }`,
    '',
    'სრული IBAN ჩანს გატანების გვერდზე. გადარიცხვის შემდეგ მონიშნეთ გადახდილად.',
  ];

  return {
    subjectKa: `გატანის მოთხოვნა: ${amount}`,
    bodyKa: lines.join('\n'),
    linkPath: PAYOUT_QUEUE_PATH,
  };
}

export type RenewalDeclinedAlertInput = {
  planName: string;
  amountMinor: number;
  currency: string;
  /** The gateway's code and wording, e.g. "1011 Parameter is missing". */
  reason: string;
  /** The order that opened the calendar: the handle to stop it by hand. */
  parentOrderId: string;
  /** Whether the gateway accepted the stop sent after the decline. */
  calendarStopped: boolean;
  /** Whether the mail provider took the notice to the subscriber. */
  subscriberNotified: boolean;
};

/** Where the message points: the payments page, which shows the delivery. */
export const PAYMENTS_PAGE_PATH = '/admin/payments';

/**
 * The gateway declined a scheduled renewal. Nobody else would notice: the
 * subscriber is told, but a decline that names the gateway's own error is
 * for an administrator to take up with the gateway. The one thing that needs
 * a hand is a calendar the gateway would not stop, so that says which order.
 */
export function renderRenewalDeclinedAlert(input: RenewalDeclinedAlertInput): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  const amount = formatMoney(input.amountMinor, input.currency);
  const lines = [
    `${input.planName}: დაგეგმილი ჩამოჭრა (${amount}) უარყოფილია.`,
    '',
    `მიზეზი: ${input.reason}`,
    input.calendarStopped
      ? 'კალენდარი გაჩერდა, მეტს აღარ ჩამოჭრის.'
      : `კალენდარი ვერ გაჩერდა, გააჩერეთ ხელით: ${input.parentOrderId}`,
    input.subscriberNotified
      ? 'გამომწერს ეცნობა ელფოსტით.'
      : 'გამომწერს ელფოსტა ვერ გაეგზავნა.',
  ];

  return {
    subjectKa: `გამოწერა ვერ განახლდა: ${input.planName}`,
    bodyKa: lines.join('\n'),
    linkPath: PAYMENTS_PAGE_PATH,
  };
}

export type RenewalUnwantedAlertInput = {
  planName: string;
  amountMinor: number;
  currency: string;
  /** The renewal the gateway charged: the order to refund by hand. */
  renewalOrderId: string;
  /** The order that opened the calendar: the handle to stop it by hand. */
  parentOrderId: string;
  /** Whether the gateway accepted the refund of the renewal. */
  refunded: boolean;
  /** Whether the gateway accepted the stop of the calendar. */
  calendarStopped: boolean;
};

/**
 * The gateway charged a renewal on a subscription that had been canceled.
 * The refund and the stop are sent automatically; this says whether each
 * went through, and names the order for whatever did not.
 */
export function renderRenewalUnwantedAlert(input: RenewalUnwantedAlertInput): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  const amount = formatMoney(input.amountMinor, input.currency);
  const lines = [
    `${input.planName}: გაუქმებულ გამოწერაზე ჩამოიჭრა ${amount}.`,
    '',
    input.refunded
      ? 'თანხა ავტომატურად დაბრუნდა.'
      : `თანხა ვერ დაბრუნდა, დააბრუნეთ ხელით: ${input.renewalOrderId}`,
    input.calendarStopped
      ? 'კალენდარი გაჩერდა, მეტს აღარ ჩამოჭრის.'
      : `კალენდარი ვერ გაჩერდა, გააჩერეთ ხელით: ${input.parentOrderId}`,
  ];

  return {
    subjectKa: `ჩამოჭრა გაუქმებულ გამოწერაზე: ${input.planName}`,
    bodyKa: lines.join('\n'),
    linkPath: PAYMENTS_PAGE_PATH,
  };
}
