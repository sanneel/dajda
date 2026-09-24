import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { EMAIL_VERIFICATION_TTL_MS } from './tokens';

/**
 * A sign-up that has not happened yet, carried in the confirmation link.
 *
 * Registration no longer creates the account. It mails a link, and the
 * account is created when the mailbox's owner opens it. The details the form
 * collected travel INSIDE that link, encrypted, so nothing is written for an
 * address until its owner proves it is theirs.
 *
 * That is what makes the form unable to say whether an address is taken.
 * Had the account been created at submit, anyone could register a stranger's
 * address with a password of their own and then try that password: signing
 * in would work only if the address had been free. With no row until the link
 * is opened, there is nothing to sign in to either way.
 *
 * AES-256-GCM: the payload holds a password digest, so it is encrypted, not
 * merely signed, and the tag makes any altered link fail to open. Pure over
 * the secret it is given, so the tests need no environment.
 */

export type PendingSignup = {
  name: string;
  email: string;
  /** scrypt digest of the chosen password, from hashPassword. */
  passwordDigest: string;
};

const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(secret: string): Buffer {
  // A key of its own, derived from AUTH_SECRET: the same secret signs other
  // things, and a key is never reused across purposes.
  return createHash('sha256').update(`${secret}:dajda-signup-v1`).digest();
}

export function sealSignup(
  pending: PendingSignup,
  secret: string,
  now: Date = new Date(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({ ...pending, exp: now.getTime() + EMAIL_VERIFICATION_TTL_MS }),
      'utf8',
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** The pending sign-up, or null for anything expired, altered or malformed. */
export function openSignup(
  token: string,
  secret: string,
  now: Date = new Date(),
): PendingSignup | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(secret),
      raw.subarray(0, IV_BYTES),
    );
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const data = JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8'),
    ) as PendingSignup & { exp: number };

    if (typeof data.exp !== 'number' || data.exp <= now.getTime()) return null;
    if (!data.name || !data.email || !data.passwordDigest) return null;
    return { name: data.name, email: data.email, passwordDigest: data.passwordDigest };
  } catch {
    return null;
  }
}
