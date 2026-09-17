import type { BillingPeriod } from '@/generated/prisma/enums';
import { addBillingPeriod } from '@/lib/payments/webhook';
import { formatDateKa, formatMoney } from '@/lib/format';

/**
 * When the card is next charged, and how that is said to the customer.
 *
 * One place, because three readers have to agree on the same date: the
 * checkout that opens the gateway's calendar, the plan card that asks for
 * consent, and the notice sent after every charge. The MIT annex requires
 * the amount and the day to be stated plainly ("15 ლარი ყოველი თვის 10
 * რიცხვში") and the next charge to be announced at least four weeks ahead,
 * and a notice that names a different day than the gateway charges on would
 * satisfy neither.
 */

/**
 * The next charge, as UTC midnight of its date.
 *
 * The gateway counts its calendar in UTC dates (see checkout-rules), so the
 * date is taken in UTC. Midnight UTC is 04:00 in Tbilisi, the same calendar
 * day, so formatting the result on the Tbilisi clock names the right date.
 */
export function nextChargeDate(from: Date, period: BillingPeriod): Date {
  const next = addBillingPeriod(from, period);
  return new Date(`${next.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** "2026-10-17", the form the gateway's recurring_data takes. */
export function chargeDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * How often, with the day: "ყოველი თვის 17 რიცხვში".
 *
 * A day past the 28th does not exist in every month. What the gateway does
 * then is not documented, so the sentence says the honest thing rather than
 * promising a date that may not come.
 */
export function chargeCadenceKa(firstCharge: Date, period: BillingPeriod): string {
  if (period === 'DAILY') return 'ყოველ დღე';

  const day = firstCharge.getUTCDate();
  const shortMonths =
    day > 28
      ? ' (მოკლე თვეში, ბოლო დღეებში)'
      : '';
  return period === 'QUARTERLY'
    ? `ყოველ 3 თვეში, ${day} რიცხვში${shortMonths}`
    : `ყოველი თვის ${day} რიცხვში${shortMonths}`;
}

/**
 * The full schedule sentence: amount, cadence, first date.
 * "30.00 ₾ ყოველი თვის 17 რიცხვში, პირველად 17 ოქტ 2026"
 */
export function chargeScheduleKa(input: {
  amountMinor: number;
  currency: string;
  period: BillingPeriod;
  nextCharge: Date;
}): string {
  const amount = formatMoney(input.amountMinor, input.currency);
  const cadence = chargeCadenceKa(input.nextCharge, input.period);
  return `${amount} ${cadence}, პირველად ${formatDateKa(input.nextCharge)}`;
}
