import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Opaque bearer tokens for sessions, email verification and password resets.
 *
 * The raw token is handed to the user exactly once (cookie or email link); the
 * database only ever holds its SHA-256. A dump of the tokens table therefore
 * cannot be replayed as a login. SHA-256 is correct here - unlike a password,
 * a 256-bit random token has no guessable keyspace to slow an attacker down.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Constant-time comparison of two already-hashed tokens. */
export function tokensMatch(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA);
  const b = Buffer.from(hashB);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The 6 digit code printed in the verification mail beside the link.
 *
 * A million combinations is nothing against an offline attack, so the code is
 * only ever checked ONLINE, behind requireUser (the attacker must already
 * hold the account's session) and a hard rate limit on attempts. Its hash is
 * salted with the user id via hashCodeForUser, both to scope it to one
 * account and so that two users drawing the same code cannot collide on the
 * unique tokenHash column.
 */
export function generateVerificationCode(): string {
  // randomInt is crypto-backed and unbiased; padStart keeps leading zeros.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCodeForUser(userId: string, code: string): string {
  return hashToken(`${userId}:${code}`);
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function expiryFrom(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
