import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` resolves to the 3-argument overload of `scrypt`, which drops the
 * options parameter we need for the cost factors. Assert the 4-argument shape.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt parameters. N=16384, r=8 costs ~16 MB per hash, which is the standard
 * interactive-login setting and comfortably above what a GPU attacker likes.
 * The parameters are stored inside each digest so they can be raised later
 * without invalidating existing passwords (see `needsRehash`).
 */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Node's default maxmem (32 MB) is too tight once N or r is raised. */
const MAX_MEM = 64 * 1024 * 1024;

const PREFIX = 'scrypt';

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  // NFKC keeps visually identical passwords typed on different keyboards
  // (notably Georgian input methods) from producing different digests.
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM,
  }) as Promise<Buffer>;
}

/** Returns `scrypt$N$r$p$salt$hash`, all binary parts base64url encoded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

type ParsedDigest = {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

function parseDigest(stored: string): ParsedDigest | null {
  const parts = stored.split('$');
  if (parts.length !== 6) return null;

  const [prefix, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  if (prefix !== PREFIX) return null;

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  // Refuse absurd parameters from a tampered row rather than allocating GBs.
  if (n < 1024 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) {
    return null;
  }

  try {
    return {
      n,
      r,
      p,
      salt: Buffer.from(rawSalt ?? '', 'base64url'),
      hash: Buffer.from(rawHash ?? '', 'base64url'),
    };
  } catch {
    return null;
  }
}

/**
 * Constant-time verification. Never throws - a malformed or truncated digest
 * is simply a failed login, so a corrupted row cannot 500 the auth endpoint.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseDigest(stored);
  if (!parsed || parsed.hash.length !== KEY_LENGTH) return false;

  try {
    const candidate = await derive(
      password,
      parsed.salt,
      parsed.n,
      parsed.r,
      parsed.p,
    );
    return timingSafeEqual(candidate, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a stored digest uses weaker parameters than we now require. */
export function needsRehash(stored: string): boolean {
  const parsed = parseDigest(stored);
  if (!parsed) return true;
  return parsed.n < SCRYPT_N || parsed.r < SCRYPT_R || parsed.p < SCRYPT_P;
}
