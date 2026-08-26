/**
 * The rules a withdrawal has to satisfy, as pure functions.
 *
 * Nothing here touches the database or the clock, so every rule below is
 * tested directly rather than inferred from a service that also writes rows.
 */

/**
 * Georgia has been on UTC+4 with no daylight saving since 2005, so a fixed
 * offset is correct rather than an approximation.
 *
 * It matters here specifically: the agreement promises withdrawal "on the last
 * day of the calendar month", and an analyst reads that in Tbilisi time. Using
 * UTC would open the window at 04:00 local on the last day and leave it open
 * until 04:00 on the 1st, which is a different promise from the one signed.
 */
export const TBILISI_UTC_OFFSET_MINUTES = 4 * 60;

/** The wall-clock fields an instant has in Tbilisi. */
export function tbilisiParts(instant: Date): {
  year: number;
  month: number;
  day: number;
} {
  const shifted = new Date(
    instant.getTime() + TBILISI_UTC_OFFSET_MINUTES * 60_000,
  );
  return {
    year: shifted.getUTCFullYear(),
    // Calendar month, 1 to 12, rather than the zero based one.
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** The instant a Tbilisi wall-clock midnight corresponds to. */
function tbilisiMidnight(year: number, month: number, day: number): Date {
  return new Date(
    Date.UTC(year, month - 1, day) - TBILISI_UTC_OFFSET_MINUTES * 60_000,
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Is the withdrawal window open?
 *
 * Open on the last calendar day of the month, in Tbilisi time, for that whole
 * day. Deliberately narrow: it is what the agreement says, and a window that
 * is open all month would make the monthly delivery check meaningless.
 */
export function isWithdrawalWindowOpen(now: Date): boolean {
  const { year, month, day } = tbilisiParts(now);
  return day === daysInMonth(year, month);
}

/** The next moment the window opens, for telling the analyst when to return. */
export function nextWithdrawalWindow(now: Date): Date {
  const { year, month, day } = tbilisiParts(now);
  const last = daysInMonth(year, month);
  if (day < last) return tbilisiMidnight(year, month, last);

  // Already the last day, so the next one is next month's.
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return tbilisiMidnight(nextYear, nextMonth, daysInMonth(nextYear, nextMonth));
}

/**
 * The calendar month a withdrawal is being paid for: the month `now` falls in,
 * in Tbilisi time, as a half-open interval of UTC instants.
 */
export function payoutPeriod(now: Date): { start: Date; end: Date } {
  const { year, month } = tbilisiParts(now);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: tbilisiMidnight(year, month, 1),
    end: tbilisiMidnight(nextYear, nextMonth, 1),
  };
}

/** Digits only, so spaces and dashes a person types are not a rejection. */
export function normaliseCardNumber(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * The Luhn check digit.
 *
 * Catches a mistyped number before it becomes a failed payout that the analyst
 * has to chase. It says nothing about whether the card exists.
 */
export function luhnValid(cardNumber: string): boolean {
  const digits = normaliseCardNumber(cardNumber);
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * The only form of the card that is ever written down.
 *
 * First six and last four, which is what the card schemes permit storing and
 * what an analyst needs to recognise which card was paid. The number itself
 * goes to the provider for one credit call and is never persisted.
 */
export function maskCardNumber(cardNumber: string): string {
  const digits = normaliseCardNumber(cardNumber);
  if (digits.length < 10) return '*'.repeat(Math.max(0, digits.length));
  const head = digits.slice(0, 6);
  const tail = digits.slice(-4);
  return `${head}${'*'.repeat(digits.length - 10)}${tail}`;
}

export type WithdrawalRefusal =
  | 'WINDOW_CLOSED'
  | 'BELOW_MINIMUM'
  | 'INSUFFICIENT_EARNINGS'
  | 'INVALID_CARD'
  | 'PENDING_REQUEST_EXISTS';

export type WithdrawalCheck =
  | { allowed: true }
  | { allowed: false; reason: WithdrawalRefusal };

/**
 * Everything that must hold before earnings may be moved into a request.
 *
 * The activity check is NOT here on purpose: failing it does not refuse the
 * request, it flags it for the administrator who releases the money, which is
 * what clause 5.6 of the agreement describes.
 */
export function checkWithdrawal(input: {
  now: Date;
  amountMinor: number;
  earningsMinor: number;
  minimumMinor: number;
  cardNumber: string;
  hasPendingRequest: boolean;
}): WithdrawalCheck {
  if (input.hasPendingRequest) {
    return { allowed: false, reason: 'PENDING_REQUEST_EXISTS' };
  }
  if (!isWithdrawalWindowOpen(input.now)) {
    return { allowed: false, reason: 'WINDOW_CLOSED' };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < input.minimumMinor) {
    return { allowed: false, reason: 'BELOW_MINIMUM' };
  }
  if (input.amountMinor > input.earningsMinor) {
    return { allowed: false, reason: 'INSUFFICIENT_EARNINGS' };
  }
  if (!luhnValid(input.cardNumber)) {
    return { allowed: false, reason: 'INVALID_CARD' };
  }
  return { allowed: true };
}

export const WITHDRAWAL_REFUSAL_KA: Record<WithdrawalRefusal, string> = {
  WINDOW_CLOSED:
    'გატანა ხელმისაწვდომია მხოლოდ თვის ბოლო დღეს.',
  BELOW_MINIMUM: 'მოთხოვნილი თანხა მინიმალურ ოდენობაზე ნაკლებია.',
  INSUFFICIENT_EARNINGS: 'დარიცხულ ნაშთზე მეტის გატანა შეუძლებელია.',
  INVALID_CARD: 'ბარათის ნომერი არასწორია.',
  PENDING_REQUEST_EXISTS:
    'თქვენ უკვე გაქვთ განსახილველი მოთხოვნა. დაელოდეთ მის დამუშავებას.',
};
