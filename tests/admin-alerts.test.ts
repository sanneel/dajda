import { describe, expect, it } from 'vitest';
import {
  PAYOUT_QUEUE_PATH,
  renderBetFinishedAlert,
  renderPayoutRequestedAlert,
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
