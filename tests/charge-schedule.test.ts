import { describe, expect, it } from 'vitest';
import {
  chargeCadenceKa,
  chargeDateIso,
  chargeScheduleKa,
  nextChargeDate,
} from '@/lib/subscriptions/charge-schedule';
import { chargeNoticeEmail } from '@/lib/subscriptions/charge-notice';
import { renewalRequest } from '@/lib/subscriptions/checkout-rules';

describe('next charge date', () => {
  it('is one period after the payment, on its UTC date', () => {
    const paid = new Date('2026-09-17T10:00:00Z');
    expect(chargeDateIso(nextChargeDate(paid, 'MONTHLY'))).toBe('2026-10-17');
    expect(chargeDateIso(nextChargeDate(paid, 'QUARTERLY'))).toBe('2026-12-17');
    expect(chargeDateIso(nextChargeDate(paid, 'DAILY'))).toBe('2026-09-18');
  });

  it('takes the UTC date, not the Tbilisi one, like the gateway', () => {
    // 02:30 on the 17th in Tbilisi is still the 16th in UTC.
    const paid = new Date('2026-09-16T22:30:00Z');
    expect(chargeDateIso(nextChargeDate(paid, 'MONTHLY'))).toBe('2026-10-16');
  });

  it('is the date the checkout opens the calendar on', () => {
    const paid = new Date('2026-09-16T22:30:00Z');
    for (const period of ['MONTHLY', 'QUARTERLY', 'DAILY'] as const) {
      expect(renewalRequest(true, period, paid)?.subscription.startDate).toBe(
        chargeDateIso(nextChargeDate(paid, period)),
      );
    }
  });
});

describe('charge schedule wording', () => {
  it('names the day of the month', () => {
    const next = new Date('2026-10-10T00:00:00Z');
    expect(chargeCadenceKa(next, 'MONTHLY')).toBe('ყოველი თვის 10 რიცხვში');
    expect(chargeCadenceKa(next, 'QUARTERLY')).toBe('ყოველ 3 თვეში, 10 რიცხვში');
    expect(chargeCadenceKa(next, 'DAILY')).toBe('ყოველ დღე');
  });

  it('does not promise a day some months lack', () => {
    expect(chargeCadenceKa(new Date('2026-10-30T00:00:00Z'), 'MONTHLY')).toContain(
      'მოკლე თვეში',
    );
  });

  it('states amount, first date and cadence together', () => {
    expect(
      chargeScheduleKa({
        amountMinor: 1500,
        currency: 'GEL',
        period: 'MONTHLY',
        nextCharge: new Date('2026-10-10T00:00:00Z'),
      }),
    ).toBe('15.00 ₾ ყოველი თვის 10 რიცხვში, პირველად 10 ოქტ 2026');
  });
});

describe('charge notice email', () => {
  const base = {
    planName: 'gulfishdog8 · გამოწერა',
    amountMinor: 3000,
    currency: 'GEL',
    period: 'MONTHLY' as const,
    nextCharge: new Date('2026-10-17T00:00:00Z'),
    accountUrl: 'https://dajda.ge/account',
  };

  it('tells the amount, the next date, the cadence and how to cancel', () => {
    const mail = chargeNoticeEmail({ ...base, first: true });
    expect(mail.subject).toBe('DAJDA: გამოწერა აქტიურია, შემდეგი ჩამოჭრა 17 ოქტ 2026');
    expect(mail.text).toContain('ჩამოიჭრა 30.00 ₾');
    expect(mail.text).toContain(
      'შემდეგი ჩამოჭრა: 30.00 ₾ ყოველი თვის 17 რიცხვში, პირველად 17 ოქტ 2026',
    );
    expect(mail.text).toContain('გაუქმება ნებისმიერ დროს');
    expect(mail.text).toContain('https://dajda.ge/account');
    expect(mail.html).toContain('https://dajda.ge/account');
  });

  it('says renewed on a renewal', () => {
    const mail = chargeNoticeEmail({ ...base, first: false });
    expect(mail.subject).toContain('გამოწერა განახლდა');
    expect(mail.text).toContain('ავტომატურად განახლდა');
  });
});
