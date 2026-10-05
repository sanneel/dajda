import { describe, expect, it } from 'vitest';
import {
  PAYMENTS_PAGE_PATH,
  PAYOUT_QUEUE_PATH,
  renderBetFinishedAlert,
  renderPayoutRequestedAlert,
  renderRenewalDeclinedAlert,
  renderRenewalUnwantedAlert,
  SETTLEMENT_QUEUE_PATH,
} from '@/lib/notifications/admin-alert-text';
import { formatMoney } from '@/lib/format';

/**
 * The message an administrator receives when an author hands a bet over.
 *
 * Pinned down because it is the one line of text the administrator reads on
 * a phone before deciding to open the queue: it has to say who, what, and
 * whether there is a screenshot to look at, and it has to point at the
 * filtered queue rather than the site root.
 */
describe('bet-finished admin alert', () => {
  const base = {
    predictionId: 'p1',
    titleKa: 'დინამო - ტორპედო, 1',
    authorName: 'გიორგი',
    sportName: 'ფეხბურთი',
    oddsMilli: 1850,
    eventAt: new Date('2026-09-02T15:00:00Z'),
    hasResultScreenshot: true,
  };

  it('names the bet in the subject and the author in the body', () => {
    const message = renderBetFinishedAlert(base);
    expect(message.subjectKa).toBe('დასათვლელია: დინამო - ტორპედო, 1');
    expect(message.bodyKa).toContain('გიორგი მონიშნა ფსონი დასრულებულად');
    expect(message.bodyKa).toContain('კოეფიციენტი: 1.85');
    expect(message.bodyKa).toContain('სპორტი: ფეხბურთი');
  });

  it('says whether a result screenshot is attached', () => {
    expect(renderBetFinishedAlert(base).bodyKa).toContain('თან ერთვის');
    expect(
      renderBetFinishedAlert({ ...base, hasResultScreenshot: false }).bodyKa,
    ).toContain('არ არის');
  });

  it('omits the match line when the bet has no kickoff time', () => {
    const message = renderBetFinishedAlert({ ...base, eventAt: null });
    expect(message.bodyKa).not.toContain('მატჩი:');
  });

  it('points at the awaiting-settlement queue', () => {
    expect(renderBetFinishedAlert(base).linkPath).toBe(SETTLEMENT_QUEUE_PATH);
    expect(SETTLEMENT_QUEUE_PATH).toBe('/admin/predictions?review=awaiting');
  });
});

/**
 * The message an administrator receives when an author asks to be paid.
 *
 * Nothing moves until an administrator transfers the money from the bank, so
 * the message has to say who and how much, and it must not carry the full
 * account: that stays on the payouts page, behind the admin login.
 */
describe('payout-requested admin alert', () => {
  const base = {
    authorName: 'გიორგი',
    amountMinor: 2500,
    currency: 'GEL',
    maskedAccount: 'GE95**************6789',
    activityCheckPassed: true,
  };

  it('names the amount in the subject and the author and account in the body', () => {
    const message = renderPayoutRequestedAlert(base);
    expect(message.subjectKa).toBe(`გატანის მოთხოვნა: ${formatMoney(2500, 'GEL')}`);
    expect(message.bodyKa).toContain('გიორგი ითხოვს გატანას');
    expect(message.bodyKa).toContain('GE95**************6789');
  });

  it('points at the payout queue', () => {
    expect(renderPayoutRequestedAlert(base).linkPath).toBe(PAYOUT_QUEUE_PATH);
    expect(PAYOUT_QUEUE_PATH).toBe('/admin/payouts');
  });

  it('never carries a full IBAN', () => {
    expect(renderPayoutRequestedAlert(base).bodyKa).not.toMatch(/GE\d{2}[A-Z0-9]{18}/);
  });

  it('flags a request whose activity check failed', () => {
    expect(
      renderPayoutRequestedAlert({ ...base, activityCheckPassed: false }).bodyKa,
    ).toContain('ვერ გაიარა');
  });
});

/**
 * The message an administrator receives when the gateway declines a renewal.
 * It carries the gateway's own error, which is the thing to quote to them,
 * and names the order whenever the calendar still needs stopping by hand.
 */
describe('renewal-declined admin alert', () => {
  const base = {
    planName: 'gulfishdog8 · გამოწერა',
    amountMinor: 100,
    currency: 'GEL',
    reason: '1011 Parameter is missing',
    parentOrderId: 'dajda-6cb46c2f-e480-420b-b5ec-0f2c7f03b6ef',
    calendarStopped: true,
    subscriberNotified: true,
  };

  it('names the plan and carries the gateway error', () => {
    const message = renderRenewalDeclinedAlert(base);
    expect(message.subjectKa).toBe('გამოწერა ვერ განახლდა: gulfishdog8 · გამოწერა');
    expect(message.bodyKa).toContain('მიზეზი: 1011 Parameter is missing');
    expect(message.bodyKa).toContain(formatMoney(100, 'GEL'));
    expect(message.linkPath).toBe(PAYMENTS_PAGE_PATH);
  });

  it('names the order to stop by hand when the gateway would not', () => {
    expect(renderRenewalDeclinedAlert(base).bodyKa).not.toContain(base.parentOrderId);
    expect(
      renderRenewalDeclinedAlert({ ...base, calendarStopped: false }).bodyKa,
    ).toContain(`გააჩერეთ ხელით: ${base.parentOrderId}`);
  });

  it('says when the subscriber could not be emailed', () => {
    expect(
      renderRenewalDeclinedAlert({ ...base, subscriberNotified: false }).bodyKa,
    ).toContain('ვერ გაეგზავნა');
  });
});

describe('unwanted-renewal admin alert', () => {
  const base = {
    planName: 'Sandro Siradze · გამოწერა',
    amountMinor: 3000,
    currency: 'GEL',
    renewalOrderId: 'recurring__1__dajda-1',
    parentOrderId: 'dajda-1',
    refunded: true,
    calendarStopped: true,
  };

  it('says the canceled subscription was charged and refunded', () => {
    const message = renderRenewalUnwantedAlert(base);
    expect(message.subjectKa).toBe(
      'ჩამოჭრა გაუქმებულ გამოწერაზე: Sandro Siradze · გამოწერა',
    );
    expect(message.bodyKa).toContain(formatMoney(3000, 'GEL'));
    expect(message.bodyKa).toContain('თანხა ავტომატურად დაბრუნდა.');
    expect(message.linkPath).toBe(PAYMENTS_PAGE_PATH);
  });

  it('names the orders to handle by hand when the gateway refused', () => {
    const message = renderRenewalUnwantedAlert({
      ...base,
      refunded: false,
      calendarStopped: false,
    });
    expect(message.bodyKa).toContain('დააბრუნეთ ხელით: recurring__1__dajda-1');
    expect(message.bodyKa).toContain('გააჩერეთ ხელით: dajda-1');
  });
});
