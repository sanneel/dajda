import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * The card number a payout goes to, at rest.
 *
 * An analyst types the number once, when asking to be paid. The provider
 * needs it once, when an administrator releases the payout - which is days
 * later, by a different person. Keeping only the mask in between meant the
 * administrator had to get the number again out of band, and "out of band"
 * for a card number is a chat message, which is worse than any database.
 *
 * So the number is sealed here and held only while the request is open:
 *
 *   - AES-256-GCM, a fresh 96-bit nonce per seal, the tag stored alongside,
 *     so a stored value can neither be read nor altered without the key.
 *   - The key is derived (HKDF-SHA256) from PAYOUT_CARD_KEY, or from
 *     AUTH_SECRET when no dedicated key is set. A dedicated key means a
 *     database dump plus the session secret still reads no cards.
 *   - The service clears the column the moment the request is decided, in
 *     every branch. Nothing here is a card store; it is an envelope in
 *     transit between two people.
 *
 * Pure: the key is a parameter, so the scheme is pinned by tests without
 * env. `openCard` returns null rather than throwing on anything that does
 * not verify - a wrong key, a truncated value, a bit flipped in storage.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const NONCE_BYTES = 12;

export function deriveCardKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, 'dajda-payout-card', 'payout card at rest', 32),
  );
}

export function sealCard(cardNumber: string, key: Buffer): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const body = Buffer.concat([cipher.update(cardNumber, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    nonce.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

export function openCard(sealed: string, key: Buffer): string | null {
  const [version, nonce, tag, body] = sealed.split('.');
  if (version !== VERSION || !nonce || !tag || !body) return null;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(nonce, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
