'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/tokens';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { openGoogleProfile, GOOGLE_PROFILE_COOKIE } from '@/lib/auth/google';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';

/**
 * Final step of a NEW Google sign-up: the two certifications arrive, the
 * sealed profile cookie is opened and the account is created.
 *
 * The profile comes from the cookie, never from the form - the browser
 * cannot claim a mailbox the callback did not verify, because it cannot
 * sign the seal. Mirrors the Telegram flow's second pass.
 */
export async function completeGoogleSignupAction(
  _previous: ActionResult<{ created: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: true }>> {
  let created = false;
  try {
    const jar = await cookies();
    const sealed = jar.get(GOOGLE_PROFILE_COOKIE)?.value;
    const profile = sealed ? openGoogleProfile(sealed) : null;
    if (!profile) {
      return fail(
        ERROR_CODES.UNAUTHENTICATED,
        'სესიას ვადა გაუვიდა. სცადეთ Google-ით შესვლა თავიდან.',
      );
    }

    if (
      formData.get('ageConfirmed') !== 'on' ||
      formData.get('acceptTerms') !== 'on'
    ) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'ორივე პირობის მონიშვნა აუცილებელია.',
      );
    }

    // The window between the callback and this submit is small but real:
    // the same mailbox may have registered meanwhile. Refuse rather than
    // silently link - linking belongs to the callback's verified path.
    const collision = await prisma.user.findFirst({
      where: {
        OR: [{ email: profile.email }, { googleId: profile.sub }],
      },
      select: { id: true },
    });
    if (collision) {
      jar.delete(GOOGLE_PROFILE_COOKIE);
      return fail(
        ERROR_CODES.CONFLICT,
        'ამ მისამართით ანგარიში უკვე არსებობს. სცადეთ შესვლა.',
      );
    }

    const requestHeaders = await headers();
    const context = {
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: requestHeaders.get('user-agent') ?? undefined,
    };

    // Random digest nobody knows, same as Telegram accounts: password login
    // stays impossible until the person sets one via the reset flow - which
    // WORKS here, because the Google email is real and receives mail.
    const password = await hashPassword(generateToken());

    const user = await prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          password,
          googleId: profile.sub,
          // Google vouched for the mailbox: verified from the first second.
          emailVerifiedAt: new Date(),
          ageConfirmedAt: new Date(),
          notificationPrefs: { create: {} },
        },
        select: { id: true, role: true },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.USER_REGISTERED,
          entityType: 'User',
          entityId: row.id,
          summary: `ახალი მომხმარებელი Google-ით: ${profile.email}`,
          actorId: row.id,
          actorRole: row.role,
          ...context,
        },
        tx,
      );

      return row;
    });

    jar.delete(GOOGLE_PROFILE_COOKIE);

    const session = await createSession(user.id, context);
    await setSessionCookie(session.token, session.expiresAt);
    created = true;
  } catch (error) {
    return toActionFailure(error);
  }
  // redirect throws by design; it must live outside the try.
  if (created) redirect('/dashboard');
  return ok({ created: true });
}
