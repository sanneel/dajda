import { describe, expect, it } from 'vitest';
import {
  renderBetFinishedAlert,
  SETTLEMENT_QUEUE_PATH,
} from '@/lib/notifications/admin-alert-text';

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
