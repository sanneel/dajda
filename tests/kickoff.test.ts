import { describe, expect, it } from 'vitest';
import {
  countsInRecord,
  kickoffRefusal,
  KICKOFF_MISSING_KA,
  KICKOFF_PASSED_KA,
} from '@/lib/predictions/kickoff';

/*
 * Terms §8.1: a prediction is published before its event starts, and one
 * published after does not count. The form checked the clock and the server
 * did not, so an author could save one draft per outcome before the match
 * and publish only the winner once the result was in.
 */
const now = new Date('2026-09-25T12:00:00Z');
const minute = 60 * 1000;

describe('publishing against the kickoff', () => {
  it('allows a ticket whose first match is still ahead', () => {
    expect(kickoffRefusal(new Date(now.getTime() + minute), now)).toBeNull();
  });

  it('refuses one whose first match has started', () => {
    expect(kickoffRefusal(new Date(now.getTime() - minute), now)).toBe(
      KICKOFF_PASSED_KA,
    );
  });

  it('refuses one published at the kickoff itself', () => {
    expect(kickoffRefusal(now, now)).toBe(KICKOFF_PASSED_KA);
  });

  it('refuses one with no kickoff, which was the way around the check', () => {
    expect(kickoffRefusal(undefined, now)).toBe(KICKOFF_MISSING_KA);
    expect(kickoffRefusal(null, now)).toBe(KICKOFF_MISSING_KA);
  });
});

describe('what counts in the record', () => {
  const kickoff = new Date('2026-09-25T18:00:00Z');

  it('counts a ticket published before its kickoff', () => {
    expect(
      countsInRecord({
        publishedAt: new Date(kickoff.getTime() - minute),
        eventAt: kickoff,
      }),
    ).toBe(true);
  });

  it('does not count one published at or after its kickoff', () => {
    expect(countsInRecord({ publishedAt: kickoff, eventAt: kickoff })).toBe(
      false,
    );
    expect(
      countsInRecord({
        publishedAt: new Date(kickoff.getTime() + 90 * minute),
        eventAt: kickoff,
      }),
    ).toBe(false);
  });

  it('keeps counting an old row with no kickoff, since nothing proves it late', () => {
    expect(countsInRecord({ publishedAt: kickoff, eventAt: null })).toBe(true);
  });

  it('never counts a draft', () => {
    expect(countsInRecord({ publishedAt: null, eventAt: kickoff })).toBe(false);
  });
});
