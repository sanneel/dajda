import { describe, expect, it } from 'vitest';
import { deriveCardKey, openCard, sealCard } from '@/lib/payouts/card-vault';

/*
 * The envelope a card number travels in between the analyst's request and
 * the administrator's approval. What matters: it opens with the key it was
 * sealed under and with nothing else, and no stored value can be quietly
 * altered into a different card.
 */
describe('payout card vault', () => {
  const key = deriveCardKey('x'.repeat(32));
  const other = deriveCardKey('y'.repeat(32));
  const card = '4444555566661111';

  it('round-trips under the same key', () => {
    expect(openCard(sealCard(card, key), key)).toBe(card);
  });

  it('seals differently every time, so equal cards are not linkable at rest', () => {
    expect(sealCard(card, key)).not.toBe(sealCard(card, key));
  });

  it('opens with nothing but the sealing key', () => {
    expect(openCard(sealCard(card, key), other)).toBeNull();
  });

  it('refuses a tampered or truncated value rather than returning garbage', () => {
    const sealed = sealCard(card, key);
    const [version, nonce, tag, body] = sealed.split('.');
    const flipped = body!.startsWith('A') ? `B${body!.slice(1)}` : `A${body!.slice(1)}`;
    expect(openCard(`${version}.${nonce}.${tag}.${flipped}`, key)).toBeNull();
    expect(openCard(`${version}.${nonce}.${tag}`, key)).toBeNull();
    expect(openCard('v0.a.b.c', key)).toBeNull();
    expect(openCard('', key)).toBeNull();
  });

  it('derives a different key from a different secret', () => {
    expect(deriveCardKey('a'.repeat(32)).equals(deriveCardKey('b'.repeat(32)))).toBe(false);
    expect(deriveCardKey('a'.repeat(32)).length).toBe(32);
  });
});
