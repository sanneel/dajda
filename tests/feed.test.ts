import { describe, expect, it } from 'vitest';
import { notePostSchema } from '@/lib/validation/schemas';

/**
 * A feed post.
 *
 * It is the one thing an author can publish that is not a bet and does not
 * touch their record, so the only rules on it are that it says something and
 * that it stays short.
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
    expect(notePostSchema.safeParse({ bodyKa: 'ა'.repeat(1201) }).success).toBe(
      false,
    );
  });
});
