import { describe, expect, it } from 'vitest';
import { canChangeOwnName } from '@/lib/account/identity';

/*
 * Who owns a name.
 *
 * The rule is enforced in the action and mirrored by the settings form, and
 * the two read the same function so they cannot drift: a form that hides the
 * field while the action still accepts it is not a rule, it is a suggestion.
 */

describe('changing your own name', () => {
  it('is free for a reader', () => {
    expect(canChangeOwnName({})).toBe(true);
    expect(
      canChangeOwnName({ analystProfileId: null, analystStatus: null }),
    ).toBe(true);
  });

  it('is closed to an approved analyst', () => {
    // Their name was checked against a photographed identity document, and
    // the public record is published under it.
    expect(
      canChangeOwnName({ analystProfileId: 'a', analystStatus: 'APPROVED' }),
    ).toBe(false);
  });

  it('is closed while an application is still being reviewed', () => {
    // The document is already with an administrator; renaming mid-review
    // would mean approving a name nobody checked.
    expect(
      canChangeOwnName({ analystProfileId: 'a', analystStatus: 'PENDING' }),
    ).toBe(false);
  });

  it('is closed to a suspended analyst', () => {
    // Suspension is not deletion: the published record is still theirs.
    expect(
      canChangeOwnName({ analystProfileId: 'a', analystStatus: 'SUSPENDED' }),
    ).toBe(false);
  });

  it('reopens for a rejected applicant', () => {
    // Nothing was verified and nothing was published; they are a reader.
    expect(
      canChangeOwnName({ analystProfileId: 'a', analystStatus: 'REJECTED' }),
    ).toBe(true);
  });
});
