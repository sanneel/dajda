import { describe, expect, it } from 'vitest';
import { isTicketStillActive } from '@/lib/tickets/active';

/**
 * What an author's page lists under "active tickets".
 *
 * Pinned because the two clocks are easy to swap: the public list empties at
 * the first kickoff, and only a holder keeps the ticket until the last one.
 */
describe('active ticket on an author page', () => {
  const now = new Date('2026-09-11T18:00:00Z');
  const hour = 60 * 60 * 1000;
  const at = (hours: number) => new Date(now.getTime() + hours * hour);

  it('is active for everybody before the first position starts', () => {
    const ticket = { eventAt: at(2), eventEndAt: at(5) };
    expect(isTicketStillActive(ticket, false, now)).toBe(true);
    expect(isTicketStillActive(ticket, true, now)).toBe(true);
  });

  it('leaves a reader who does not hold it once the first position starts', () => {
    expect(
      isTicketStillActive({ eventAt: at(-1), eventEndAt: at(3) }, false, now),
    ).toBe(false);
  });

  it('stays for the holder until the last position starts', () => {
    expect(
      isTicketStillActive({ eventAt: at(-1), eventEndAt: at(3) }, true, now),
    ).toBe(true);
    expect(
      isTicketStillActive({ eventAt: at(-3), eventEndAt: at(-1) }, true, now),
    ).toBe(false);
  });

  it('treats a single-match ticket as starting and ending at one kickoff', () => {
    expect(
      isTicketStillActive({ eventAt: at(-1), eventEndAt: null }, true, now),
    ).toBe(false);
    expect(
      isTicketStillActive({ eventAt: at(1), eventEndAt: null }, true, now),
    ).toBe(true);
  });

  it('counts a kickoff at this very moment as started', () => {
    expect(
      isTicketStillActive({ eventAt: now, eventEndAt: null }, false, now),
    ).toBe(false);
  });

  it('keeps a ticket with no kickoff recorded until it settles', () => {
    expect(
      isTicketStillActive({ eventAt: null, eventEndAt: null }, false, now),
    ).toBe(true);
  });
});
