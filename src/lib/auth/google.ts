import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Sign in with Google, spoken directly: the standard OAuth 2.0 code flow
 * against Google's own endpoints. No SDK and no third-party auth service -
 * the session system this app already has stays the only session system,
 * and Google is just one more way to prove "this mailbox is mine".
 *
 * Identity is TRUSTED FROM THE USERINFO ENDPOINT, not from parsing the id
 * token ourselves: the response arrives over TLS from Google in exchange
 * for a code only Google issued, which is the same trust chain verifying
 * the JWT signature would establish, minus a JWKS fetch and a JWT library.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export const GOOGLE_STATE_COOKIE = 'dajda_google_state';
export const GOOGLE_PROFILE_COOKIE = 'dajda_google_profile';

export function googleConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${getEnv().APP_URL}/api/auth/google/callback`;
}

/** The consent-screen URL the login button sends the browser to. */
export function googleAuthUrl(state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    // openid+email+profile: the mailbox and a display name, nothing more.
    scope: 'openid email profile',
    state,
    // Always offer the account chooser: "signed into the wrong Google
    // account" is otherwise unrecoverable without clearing cookies.
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = {
  /** Google's stable subject id - the lookup key. */
  sub: string;
  email: string;
  name: string;
};

/**
 * Turn the callback's one-time code into a verified profile.
 *
 * Refuses an unverified email outright: linking or creating an account on
 * an address Google has not confirmed would let anyone claim any mailbox
 * by typing it into a Google account.
 */
export async function exchangeGoogleCode(
  code: string,
): Promise<{ ok: true; profile: GoogleProfile } | { ok: false; reason: string }> {
  const env = getEnv();

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID as string,
        client_secret: env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
  } catch (error) {
    return { ok: false, reason: `token endpoint unreachable: ${String(error)}` };
  }
  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => '');
    return { ok: false, reason: `token exchange ${tokenResponse.status} ${body.slice(0, 200)}` };
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    return { ok: false, reason: 'token response carried no access_token' };
  }

  let infoResponse: Response;
  try {
    infoResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
  } catch (error) {
    return { ok: false, reason: `userinfo unreachable: ${String(error)}` };
  }
  if (!infoResponse.ok) {
    return { ok: false, reason: `userinfo ${infoResponse.status}` };
  }

  const info = (await infoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!info.sub || !info.email) {
    return { ok: false, reason: 'userinfo missing sub or email' };
  }
  if (info.email_verified !== true) {
    return { ok: false, reason: 'google email not verified' };
  }

  return {
    ok: true,
    profile: {
      sub: info.sub,
      email: info.email.toLowerCase(),
      name: (info.name ?? info.email).slice(0, 80),
    },
  };
}

/*
 * The confirm-step handoff.
 *
 * A NEW Google account still owes the two certifications the register form
 * collects (18+ and the terms), so the callback cannot create it outright.
 * The verified profile travels to the confirmation page in a cookie signed
 * with AUTH_SECRET and stamped with an expiry - the browser carries it, but
 * cannot mint or alter one.
 */
const PROFILE_TTL_MS = 10 * 60 * 1000;

function signPayload(payload: string): string {
  return createHmac('sha256', getEnv().AUTH_SECRET)
    .update(payload)
    .digest('base64url');
}

export function sealGoogleProfile(profile: GoogleProfile, now = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({ ...profile, exp: now.getTime() + PROFILE_TTL_MS }),
  ).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

export function openGoogleProfile(
  sealed: string,
  now = new Date(),
): GoogleProfile | null {
  const [payload, signature] = sealed.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as
      GoogleProfile & { exp: number };
    if (typeof data.exp !== 'number' || data.exp <= now.getTime()) return null;
    if (!data.sub || !data.email) return null;
    return { sub: data.sub, email: data.email, name: data.name };
  } catch {
    return null;
  }
}
