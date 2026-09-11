/**
 * The rules a withdrawal has to satisfy, as pure functions.
 *
 * Nothing here touches the database or the clock, so every rule below is
 * tested directly rather than inferred from a service that also writes rows.
 */
import { TBILISI_UTC_OFFSET_MINUTES, tbilisiParts } from '@/lib/time';

/*
 * The Tbilisi clock lives in @/lib/time because the whole product reads in it,
 * not only payouts. It matters here specifically: the agreement promises
 * withdrawal "on the last day of the calendar month", and an analyst reads
 * that in Tbilisi time. Using UTC would open the window at 04:00 local on the
 * last day and leave it open until 04:00 on the 1st, which is a different
 * promise from the one signed. Re-exported so the rules read as one module.
 */
export { TBILISI_UTC_OFFSET_MINUTES, tbilisiParts } from '@/lib/time';

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
 * An administrator's override of the calendar, for one author.
 *
 * SCHEDULE is the agreement's own rule and the default. The other two exist
 * because the calendar cannot see the cases a person can: an author who
 * could not reach the window, a correction owed today, a disputed month that
 * should not pay out even though it is the 31st. Mirrors the database enum.
 */
export type PayoutWindowOverride = 'SCHEDULE' | 'OPEN' | 'CLOSED';

/**
 * Is the withdrawal window open?
 *
 * By the calendar: the last day of the month, in Tbilisi time, for that whole
 * day. Deliberately narrow - it is what the agreement says, and a window open
 * all month would make the monthly delivery check meaningless.
 *
 * An override decides it outright in either direction. It is passed in rather
 * than read here so this file keeps its promise of touching neither the
 * database nor the clock.
 */
export function isWithdrawalWindowOpen(
  now: Date,
  override: PayoutWindowOverride = 'SCHEDULE',
): boolean {
  if (override === 'OPEN') return true;
  if (override === 'CLOSED') return false;
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

/**
 * Upper case, with every separator stripped out. An IBAN is case-insensitive
 * and is normally printed in groups of four, so neither the case nor whatever
 * a bank statement put between the groups is a reason to refuse what somebody
 * copied across. Stripping is safe because what is left still has to satisfy
 * the shape and the check digits.
 */
export function normaliseIban(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * The IBAN check digits (ISO 13616 / ISO 7064 mod-97-10).
 *
 * Catches a mistyped account before it becomes a failed payout the analyst has
 * to chase. It says nothing about whether the account exists.
 *
 * Georgian only, deliberately: Flitt credits an IBAN in GEL and nothing else,
 * so a foreign account is refused at the gateway anyway. Refusing it here, with
 * a sentence that says why, beats holding somebody's earnings for a week.
 */
export function ibanValid(input: string): boolean {
  const iban = normaliseIban(input);
  if (!/^GE\d{2}[A-Z0-9]{18}$/.test(iban)) return false;

  // Move the country code and check digits to the end, letters become their
  // position in the alphabet plus nine, and the whole number must be 1 mod 97.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const chunk =
      char >= 'A' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of chunk) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/**
 * The only form of the account that is ever written down.
 *
 * The country code, the check digits and the last four, which is what an
 * analyst needs to recognise which account was paid without the row becoming a
 * copy of their banking details. The IBAN itself goes to the provider for one
 * credit call and is not persisted past the decision.
 */
export function maskIban(input: string): string {
  const iban = normaliseIban(input);
  if (iban.length < 8) return '*'.repeat(iban.length);
  return `${iban.slice(0, 4)}${'*'.repeat(iban.length - 8)}${iban.slice(-4)}`;
}

export type WithdrawalRefusal =
  | 'WINDOW_CLOSED'
  /** Shut by an administrator, not by the calendar. A different sentence. */
  | 'WINDOW_HELD'
  | 'BELOW_MINIMUM'
  | 'INSUFFICIENT_EARNINGS'
  | 'INVALID_IBAN'
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
  iban: string;
  hasPendingRequest: boolean;
  /** The administrator's override for this author. Defaults to the calendar. */
  override?: PayoutWindowOverride;
}): WithdrawalCheck {
  const override = input.override ?? 'SCHEDULE';

  if (input.hasPendingRequest) {
    return { allowed: false, reason: 'PENDING_REQUEST_EXISTS' };
  }
  if (!isWithdrawalWindowOpen(input.now, override)) {
    return {
      allowed: false,
      // A held author is refused on the last day too, and telling them to
      // come back on the last day would be a lie they cannot act on.
      reason: override === 'CLOSED' ? 'WINDOW_HELD' : 'WINDOW_CLOSED',
    };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < input.minimumMinor) {
    return { allowed: false, reason: 'BELOW_MINIMUM' };
  }
  if (input.amountMinor > input.earningsMinor) {
    return { allowed: false, reason: 'INSUFFICIENT_EARNINGS' };
  }
  if (!ibanValid(input.iban)) {
    return { allowed: false, reason: 'INVALID_IBAN' };
  }
  return { allowed: true };
}

export const WITHDRAWAL_REFUSAL_KA: Record<WithdrawalRefusal, string> = {
  WINDOW_CLOSED:
    'გატანა ხელმისაწვდომია მხოლოდ თვის ბოლო დღეს.',
  WINDOW_HELD:
    'გატანა თქვენთვის დროებით შეჩერებულია ადმინისტრაციის მიერ. დაგვიკავშირდით დეტალებისთვის.',
  BELOW_MINIMUM: 'მოთხოვნილი თანხა მინიმალურ ოდენობაზე ნაკლებია.',
  INSUFFICIENT_EARNINGS: 'დარიცხულ ნაშთზე მეტის გატანა შეუძლებელია.',
  INVALID_IBAN:
    'IBAN არასწორია. შეიყვანეთ ქართული საბანკო ანგარიშის ნომერი, მაგალითად GE95TB0000000123456789.',
  PENDING_REQUEST_EXISTS:
    'თქვენ უკვე გაქვთ განსახილველი მოთხოვნა. დაელოდეთ მის დამუშავებას.',
};

/**
 * The platform's floor under a declared monthly minimum. Agreement 3.5: the
 * author names their own number when they apply, and it may not be below 8.
 */
export const PLATFORM_MONTHLY_MINIMUM = 8;

/**
 * The month's delivery, judged the way the agreement words it.
 *
 * Two conditions, both from clause 3.5. The total must reach what the author
 * declared (3.5.1), because that number is printed on their page and a
 * subscriber paid on the strength of it. And no full calendar week may pass
 * with nothing published (3.5.2), because forty posts in the last three days
 * after three silent weeks is not the product that was sold.
 *
 * A full week is Monday to Sunday in Tbilisi, wholly inside the month. The
 * days before the first Monday and after the last full Sunday still count in
 * the total; they just cannot leave a week empty on their own.
 *
 * Georgia has no daylight saving, so a week is always exactly 7 x 24h.
 */
export type MonthlyActivity = {
  /** What the author declared, or the platform floor when they never did. */
  declaredMinimum: number;
  total: number;
  /** Full Monday-to-Sunday weeks inside the period. */
  weeks: number;
  /** Publications per full week, oldest first. */
  perWeek: number[];
  /** Full weeks with nothing published. Any one of them breaches 3.5.2. */
  emptyWeeks: number;
  passed: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function monthlyActivity(input: {
  period: { start: Date; end: Date };
  publishedAt: Date[];
  /** The author's declared number; null on profiles approved before it existed. */
  declaredMinimum: number | null;
}): MonthlyActivity {
  const declaredMinimum = Math.max(
    PLATFORM_MONTHLY_MINIMUM,
    input.declaredMinimum ?? PLATFORM_MONTHLY_MINIMUM,
  );
  const startMs = input.period.start.getTime();
  const endMs = input.period.end.getTime();

  // The first Tbilisi Monday at or after the start. Shifting the instant by
  // the offset makes its UTC weekday the Tbilisi one (0 is Sunday).
  const startWeekday = new Date(
    startMs + TBILISI_UTC_OFFSET_MINUTES * 60_000,
  ).getUTCDay();
  const firstMondayMs = startMs + ((8 - startWeekday) % 7) * DAY_MS;

  const weeks = Math.max(0, Math.floor((endMs - firstMondayMs) / WEEK_MS));
  const perWeek = new Array<number>(weeks).fill(0);
  let total = 0;

  for (const published of input.publishedAt) {
    const at = published.getTime();
    if (at < startMs || at >= endMs) continue;
    total += 1;
    if (at < firstMondayMs) continue;
    const week = Math.floor((at - firstMondayMs) / WEEK_MS);
    if (week < weeks) perWeek[week] = (perWeek[week] ?? 0) + 1;
  }

  const emptyWeeks = perWeek.filter((count) => count === 0).length;

  return {
    declaredMinimum,
    total,
    weeks,
    perWeek,
    emptyWeeks,
    passed: total >= declaredMinimum && emptyWeeks === 0,
  };
}
