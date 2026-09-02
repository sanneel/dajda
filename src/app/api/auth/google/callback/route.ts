import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import {
  decideGoogleLink,
  exchangeGoogleCode,
  googleConfigured,
  sealGoogleProfile,
  GOOGLE_PROFILE_COOKIE,
  GOOGLE_STATE_COOKIE,
} from '@/lib/auth/google';
import {
  createSession,
  revokeAllSessionsForUser,
  setSessionCookie,
} from '@/lib/auth/session';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Google sends the browser back here with a one-time code.
 *
 * Every failure lands on /login?error=google rather than an error page: from
 * the person's side all of them mean the same thing - "that did not work,
 * try again" - and the distinctions live in the server log where they are
 * actionable.
 *
 * An EXISTING account signs straight in. A NEW one is not created here:
 * the verified profile is sealed into a short-lived signed cookie and the
 * person goes to the confirmation page to give the same two certifications
 * the register form collects. Account creation without an explicit 18+
 * confirmation would break the platform's own terms.
 */
export async function GET(request: Request) {
  if (!googleConfigured()) {
    return new Response('Not Found', { status: 404 });
  }

  const jar = await cookies();
  const url = new URL(request.url);

  const expectedState = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE);

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error('[dajda] google callback: state mismatch or missing code');
    redirect('/login?error=google');
  }

  const outcome = await exchangeGoogleCode(code);
  if (!outcome.ok) {
    console.error(`[dajda] google sign-in failed: ${outcome.reason}`);
    redirect('/login?error=google');
  }
  const profile = outcome.profile;

  // First key: the stable subject id. Second: a matching mailbox on an
  // existing account that has itself been VERIFIED, which links the two ways
  // of signing in. See decideGoogleLink for why verification is the gate.
  let user = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    select: { id: true, role: true, status: true },
  });

  if (!user) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
      select: {
        id: true,
        role: true,
        status: true,
        googleId: true,
        emailVerifiedAt: true,
      },
    });
    if (byEmail) {
      const decision = decideGoogleLink(byEmail);

      /*
       * An unverified password account on this address is NOT linked. Anyone
       * can register any address without proving it, so attaching Google
       * here would sign the real mailbox owner into an account somebody else
       * holds the password to. They are sent to sign in with that password
       * instead; if it is not theirs, the reset flow reaches the mailbox
       * Google just vouched for.
       */
      if (decision === 'UNVERIFIED') {
        console.error(
          '[dajda] google callback: address belongs to an unverified account, refusing to link',
        );
        redirect('/login?error=google-unverified');
      }
      if (decision === 'TAKEN') {
        console.error(
          '[dajda] google callback: address already bound to another google subject',
        );
        redirect('/login?error=google');
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: byEmail.id },
          data: { googleId: profile.sub },
        });
        await writeAuditLog(
          {
            action: AUDIT_ACTIONS.USER_GOOGLE_LINKED,
            entityType: 'User',
            entityId: byEmail.id,
            summary: 'Google-ის ანგარიში მიება არსებულ ანგარიშს',
            actorId: byEmail.id,
            actorRole: byEmail.role,
          },
          tx,
        );
      });

      // Linking changes who can open this account. Sessions opened before
      // it, with the password alone, do not carry over.
      await revokeAllSessionsForUser(byEmail.id);
      user = byEmail;
    }
  }

  if (user) {
    // Same single message as password login: a suspended or closed account
    // is indistinguishable from a failed attempt.
    if (user.status !== 'ACTIVE') redirect('/login?error=google');

    const requestHeaders = await headers();
    const context = {
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: requestHeaders.get('user-agent') ?? undefined,
    };
    const session = await createSession(user.id, context);
    await setSessionCookie(session.token, session.expiresAt);

    await writeAuditLog({
      action: AUDIT_ACTIONS.USER_LOGGED_IN,
      entityType: 'User',
      entityId: user.id,
      summary: 'შესვლა Google-ით',
      actorId: user.id,
      actorRole: user.role,
      ...context,
    });

    redirect('/dashboard');
  }

  // New person: hand the verified profile to the confirmation step.
  jar.set(GOOGLE_PROFILE_COOKIE, sealGoogleProfile(profile), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().APP_URL.startsWith('https://'),
    maxAge: 600,
    path: '/',
  });
  redirect('/auth/google');
}
