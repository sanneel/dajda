import { describe, expect, it } from 'vitest';
import {
  GATE_ACTION_KA,
  GATE_PRICE_KA,
  GATE_SENTENCE_KA,
  GATE_TITLE_KA,
  ticketGate,
} from '@/lib/tickets/gate';

/*
 * A shut ticket has to say why it is shut.
 *
 * The feed rows told every signed-out reader that a FREE prediction "opens
 * with a subscription" and titled it "closed", while the ticket's own page
 * said - correctly - that it opens after signing in. Two places held the same
 * fact and one of them was wrong, which is the worst version of wrong here:
 * it advertises a price on something that costs nothing, to exactly the
 * person deciding whether to make an account.
 */

describe('why a ticket is shut', () => {
  it('is the sign-in wall for a free prediction', () => {
    expect(ticketGate('PUBLIC')).toBe('signin');
  });

  it('is a purchase for a singly-sold ticket', () => {
    expect(ticketGate('PREMIUM')).toBe('purchase');
  });

  it('is a subscription for a subscriber-only ticket', () => {
    expect(ticketGate('VIP')).toBe('subscription');
  });
});

describe('what a shut free prediction says', () => {
  const gate = ticketGate('PUBLIC');

  it('asks for an account, never for money', () => {
    expect(GATE_ACTION_KA[gate]).toBe('ავტორიზაცია');

    // The three words that must never reach a free ticket's reader.
    for (const copy of [
      GATE_ACTION_KA[gate],
      GATE_TITLE_KA[gate],
      GATE_PRICE_KA[gate],
      GATE_SENTENCE_KA[gate],
    ]) {
      expect(copy).not.toContain('გამოწერ');
      expect(copy).not.toContain('შეძენ');
      expect(copy).not.toContain('ყიდვ');
    }
  });

  it('calls itself free rather than closed', () => {
    expect(GATE_TITLE_KA[gate]).toBe('უფასო პროგნოზი');
    expect(GATE_TITLE_KA[gate]).not.toContain('დახურული');
    expect(GATE_PRICE_KA[gate]).toBe('უფასო');
  });
});

describe('what a paid ticket says', () => {
  it('names the purchase, not a subscription', () => {
    expect(GATE_ACTION_KA.purchase).toContain('შეძენ');
    expect(GATE_SENTENCE_KA.purchase).toContain('შეძენ');
    expect(GATE_ACTION_KA.purchase).not.toContain('გამოწერ');
  });

  it('names the subscription, not a purchase', () => {
    expect(GATE_ACTION_KA.subscription).toContain('გამოწერ');
    expect(GATE_SENTENCE_KA.subscription).toContain('გამოწერ');
    expect(GATE_ACTION_KA.subscription).not.toContain('შეძენ');
  });

  it('withholds the pick behind a neutral title', () => {
    expect(GATE_TITLE_KA.purchase).toBe('დახურული პროგნოზი');
    expect(GATE_TITLE_KA.subscription).toBe('დახურული პროგნოზი');
  });
});

describe('every gate', () => {
  it('has copy for all four places it is shown', () => {
    // A missing entry renders as `undefined` in the interface rather than
    // failing a build, so the table is checked rather than trusted.
    for (const visibility of ['PUBLIC', 'PREMIUM', 'VIP'] as const) {
      const gate = ticketGate(visibility);
      for (const table of [
        GATE_ACTION_KA,
        GATE_TITLE_KA,
        GATE_PRICE_KA,
        GATE_SENTENCE_KA,
      ]) {
        expect(typeof table[gate]).toBe('string');
        expect(table[gate].length).toBeGreaterThan(0);
      }
    }
  });
});
