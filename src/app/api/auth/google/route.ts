import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  googleConfigured,
  googleAuthUrl,
  GOOGLE_STATE_COOKIE,
} from '@/lib/auth/google';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Start of the Google flow: mint a state, remember it in a cookie only this
 * browser holds, and hand the person to Google's account chooser. The state
 * is what ties the eventual callback to a flow THIS browser started - see
 * the callback for the check.
 */
export async function GET() {
  if (!googleConfigured()) {
    return new Response('Not Found', { status: 404 });
  }

  const state = randomBytes(24).toString('base64url');
  const jar = await cookies();
  jar.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().APP_URL.startsWith('https://'),
    maxAge: 600,
    path: '/',
  });

  redirect(googleAuthUrl(state));
}
