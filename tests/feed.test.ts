import { describe, expect, it } from 'vitest';
import {
  liveNoticeSchema,
  liveUpdateSchema,
  notePostSchema,
} from '@/lib/validation/schemas';

/**
 * Feed posts and the rules that decide who gets interrupted.
 *
 * The notification fan-out itself needs a database and is exercised against
 * the running app rather than here; what IS testable in isolation is the
 * boundary that decides whether a post is even eligible to notify anyone.
 */

describe('feed post validation', () => {
  it('accepts a plain note', () => {
    expect(notePostSchema.safeParse({ bodyKa: 'ვუყურებ მატჩს.' }).success).toBe(
      true,
    );
  });

  it('rejects an empty or whitespace-only note', () => {
    expect(notePostSchema.safeParse({ bodyKa: '' }).success).toBe(false);
    expect(notePostSchema.safeParse({ bodyKa: '   ' }).success).toBe(false);
  });

  it('caps a post so the feed cannot become an article', () => {
    expect(
      notePostSchema.safeParse({ bodyKa: 'ა'.repeat(1201) }).success,
    ).toBe(false);
  });

  /*
   * A live notice is the only post that writes into other people's inboxes,
   * and what earns it that is the appointment: a time and a match. Without
   * both it is a note, so the schema must not let one through as a notice.
   */
  it('requires both a time and a label before it can notify anyone', () => {
    const base = { bodyKa: 'ვიწყებ ლაივს.' };
    expect(liveNoticeSchema.safeParse(base).success).toBe(false);
    expect(
      liveNoticeSchema.safeParse({ ...base, liveAt: '2026-09-01T20:00' })
        .success,
    ).toBe(false);
    expect(
      liveNoticeSchema.safeParse({ ...base, liveLabelKa: 'დინამო vs საბურთალო' })
        .success,
    ).toBe(false);
    expect(
      liveNoticeSchema.safeParse({
        ...base,
        liveAt: '2026-09-01T20:00',
        liveLabelKa: 'დინამო vs საბურთალო',
      }).success,
    ).toBe(true);
  });

  it('rejects an unparseable live time rather than defaulting to now', () => {
    const parsed = liveNoticeSchema.safeParse({
      bodyKa: 'ვიწყებ ლაივს.',
      liveAt: 'ხვალ',
      liveLabelKa: 'დინამო vs საბურთალო',
    });
    expect(parsed.success).toBe(false);
  });

  it('requires a real parent id on an update', () => {
    expect(
      liveUpdateSchema.safeParse({ parentId: 'latest', bodyKa: 'გოლი.' })
        .success,
    ).toBe(false);
    expect(
      liveUpdateSchema.safeParse({
        parentId: '00000000-0000-4000-8000-000000000001',
        bodyKa: 'გოლი.',
      }).success,
    ).toBe(true);
  });
});
