import { describe, expect, it } from 'vitest';
import { analystDisplayNameSchema } from '@/lib/validation/schemas';
import { canChangeOwnName } from '@/lib/account/identity';

/*
 * Two names, one editable.
 *
 * The account holder's name was checked against an identity document, so an
 * approved author cannot move it. The byline never carried that claim and is
 * theirs. Both rules live here together, because the bug they guard against
 * is treating them as the same field.
 */

const APPROVED = {
  analystProfileId: '00000000-0000-4000-8000-000000000001',
  analystStatus: 'APPROVED' as const,
};

describe('an author and their two names', () => {
  it('locks the verified name', () => {
    expect(canChangeOwnName(APPROVED)).toBe(false);
  });

  it('leaves a reader their own name, having verified nothing', () => {
    expect(canChangeOwnName({ analystProfileId: null })).toBe(true);
  });

  it('accepts a byline, which is the control for the refusals below', () => {
    const parsed = analystDisplayNameSchema.safeParse({
      displayName: 'ხაზო 25',
    });
    expect(parsed.success && parsed.data.displayName).toBe('ხაზო 25');
  });

  it('trims, so a name of spaces is not a name', () => {
    expect(
      analystDisplayNameSchema.safeParse({ displayName: '  ხაზო  ' }).success &&
        analystDisplayNameSchema.parse({ displayName: '  ხაზო  ' }).displayName,
    ).toBe('ხაზო');
    expect(
      analystDisplayNameSchema.safeParse({ displayName: '   ' }).success,
    ).toBe(false);
  });

  it('refuses an empty or oversized byline', () => {
    for (const displayName of ['', 'ა', 'ა'.repeat(61)]) {
      expect(
        analystDisplayNameSchema.safeParse({ displayName }).success,
      ).toBe(false);
    }
  });
});
