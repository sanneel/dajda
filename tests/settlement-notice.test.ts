import { describe, expect, it } from 'vitest';
import { renderSettlementNotice } from '@/lib/notifications/settlement-text';

/*
 * The settlement notice goes to everyone who saved the author, and saving is
 * free. It used to carry the ticket's title whatever the ticket cost, so a
 * follower who never paid received every paid pick by email and Telegram.
 */
describe('settlement notice', () => {
  const base = {
    status: 'WON' as const,
    titleKa: 'დინამო vs საბურთალო, ჯამური 2.5+',
    oddsMilli: 1850,
    profitUnitsCenti: 85,
    authorName: 'გიორგი',
  };

  it('names a free ticket', () => {
    const notice = renderSettlementNotice({ ...base, visibility: 'PUBLIC' });
    expect(notice.bodyKa).toContain(base.titleKa);
    expect(notice.subjectKa).toContain(base.authorName);
  });

  for (const visibility of ['PREMIUM', 'VIP'] as const) {
    it(`never names a ${visibility} ticket, settled or not`, () => {
      const notice = renderSettlementNotice({ ...base, visibility });
      expect(notice.bodyKa).not.toContain(base.titleKa);
      expect(notice.subjectKa).not.toContain(base.titleKa);
      // Still says how it went: the record is honest about losses and wins.
      expect(notice.bodyKa).toContain('1.85');
      expect(notice.bodyKa).toContain('ერთეულები');
    });
  }
});
