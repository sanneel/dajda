import { describe, expect, it } from 'vitest';
import { renewalDeclinedEmail } from '@/lib/subscriptions/renewal-declined';

/**
 * The notice a subscriber gets when the gateway declines their renewal.
 *
 * Pinned down because it is the only explanation they get for losing access:
 * it has to say the charge did not happen, that nothing renews any more, when
 * access ends, and where to buy again. It must not repeat the gateway's
 * internal error, which says nothing about their card.
 */
describe('renewal declined email', () => {
  const base = {
    planName: 'gulfishdog8 · გამოწერა',
    amountMinor: 100,
    currency: 'GEL',
    accessEnds: new Date('2026-09-27T03:33:08Z'),
    now: new Date('2026-09-27T04:31:15Z'),
    calendarStopped: true,
    resubscribeUrl: 'https://dajda.ge/analysts/gulfishdog8',
  };

  it('says the charge failed and nothing renews any more', () => {
    const mail = renewalDeclinedEmail(base);
    expect(mail.subject).toBe('DAJDA: გამოწერა ვერ განახლდა');
    expect(mail.text).toContain('ბარათიდან 1.00 ₾ ვერ ჩამოიჭრა');
    expect(mail.text).toContain('აღარ განახლდება');
    expect(mail.text).toContain('შენახული ბარათი წაიშალა');
    expect(mail.text).not.toContain('Parameter');
  });

  it('points at the page to subscribe again', () => {
    const mail = renewalDeclinedEmail(base);
    expect(mail.text).toContain('https://dajda.ge/analysts/gulfishdog8');
    expect(mail.html).toContain('https://dajda.ge/analysts/gulfishdog8');
  });

  it('says access is over when the paid period already ran out', () => {
    expect(renewalDeclinedEmail(base).text).toContain(
      'წვდომა გადახდილ პერიოდთან ერთად დასრულდა',
    );
  });

  it('gives the end date when paid access still has time left', () => {
    const mail = renewalDeclinedEmail({
      ...base,
      accessEnds: new Date('2026-10-03T20:00:00Z'),
    });
    expect(mail.text).toContain('წვდომა მთავრდება:');
    expect(mail.text).not.toContain('დასრულდა');
  });

  it('promises no further charges only when the calendar was stopped', () => {
    expect(renewalDeclinedEmail(base).text).toContain('მეტი თანხა არ ჩამოიჭრება');
    expect(
      renewalDeclinedEmail({ ...base, calendarStopped: false }).text,
    ).not.toContain('მეტი თანხა არ ჩამოიჭრება');
  });
});
