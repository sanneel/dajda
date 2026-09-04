import { deriveCardKey, openCard, sealCard } from '@/lib/payouts/card-vault';
import { getEnv } from '@/lib/env';

/**
 * The gateway's reusable card token, at rest.
 *
 * A rectoken is not a card number, but with the merchant key it charges the
 * card, so a database copy in the clear is a charging capability lying
 * around. It travels in the same AES-256-GCM envelope the payout card
 * numbers use, under a key derived from PAYOUT_CARD_KEY (or AUTH_SECRET).
 *
 * `openCardToken` answers null for anything it cannot open, including a
 * value written before sealing existed: a token that cannot be read is a
 * token we do not have, and the gateway's own renewal calendar does not
 * need it.
 */

export function sealCardToken(token: string, key: Buffer): string {
  return sealCard(token, key);
}

export function openCardToken(sealed: string, key: Buffer): string | null {
  return openCard(sealed, key);
}

export function cardTokenKey(): Buffer {
  const env = getEnv();
  return deriveCardKey(env.PAYOUT_CARD_KEY ?? env.AUTH_SECRET);
}
