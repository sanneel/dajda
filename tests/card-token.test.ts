import { describe, expect, it } from 'vitest';
import { deriveCardKey } from '@/lib/payouts/card-vault';
import { openCardToken, sealCardToken } from '@/lib/payments/card-token';

/*
 * The gateway's reusable card token at rest. Same envelope as the payout
 * card numbers; what matters here is that a stored value never equals the
 * token, and that the wrong key or a pre-sealing plaintext reads as no token.
 */
describe('card token at rest', () => {
  const key = deriveCardKey('k'.repeat(32));
  const other = deriveCardKey('o'.repeat(32));
  const token = 'C5B8D0E1F2A3B4C5D6E7F8091A2B3C4D5E6F7A8B';

  it('round-trips under the same key', () => {
    expect(openCardToken(sealCardToken(token, key), key)).toBe(token);
  });

  it('never stores the token itself', () => {
    const sealed = sealCardToken(token, key);
    expect(sealed).not.toContain(token);
    expect(sealed).not.toBe(sealCardToken(token, key));
  });

  it('reads as no token under another key or when stored in the clear', () => {
    expect(openCardToken(sealCardToken(token, key), other)).toBeNull();
    expect(openCardToken(token, key)).toBeNull();
  });
});
