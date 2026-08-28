'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  clearSessionCookie,
  createSession,
  readSession,
  revokeAllSessionsForUser,
  revokeSession,
  setSessionCookie,
} from '@/lib/auth/session';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  expiryFrom,
  generateToken,
  generateVerificationCode,
  hashCodeForUser,
  hashToken,
} from '@/lib/auth/tokens';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationLinkWhenUnsent,
} from '@/lib/auth/mail';
import {
  ERROR_CODES,
  fail,
  ok,
  toActionFailure,
  type ActionResult,
} from '@/lib/errors';
import { RATE_LIMITS, rateLimiter } from '@/lib/rate-limit';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/lib/validation/schemas';

/**
 * Authentication actions.
 *
 * CSRF: Server Actions are protected by Next's built-in Origin/Host check, so
 * these entry points cannot be driven from another site.
 */

async function requestContext() {
  const headerList = await headers();
  return {
    // x-forwarded-for is only trustworthy behind a proxy that sets it; it is
    // used for rate limiting and audit context, never for authorization.
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent'),
  };
}

/**
 * A throwaway digest used to equalise the work done on a failed login. Without
 * it, "unknown email" would return measurably faster than "wrong password",
 * which leaks whether an address is registered.
 */
const DUMMY_DIGEST =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' +
  'x'.repeat(86);

export async function registerAction(
  _previous: ActionResult<{ userId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  let success = false;

  try {
    const context = await requestContext();

    const limit = rateLimiter.check(
      `register:${context.ipAddress ?? 'unknown'}`,
      RATE_LIMITS.register,
    );
    if (!limit.allowed) return fail(ERROR_CODES.RATE_LIMITED);

    const parsed = registerSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      telegramUsername: formData.get('telegramUsername') || undefined,
      ageConfirmed: formData.get('ageConfirmed') === 'on',
      acceptTerms: formData.get('acceptTerms') === 'on',
    });

    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const input = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      return fail(ERROR_CODES.CONFLICT, undefined, {
        email: ['ამ ელფოსტით ანგარიში უკვე არსებობს.'],
      });
    }

    const password = await hashPassword(input.password);

    // The raw token exists only in this request and in the email; the
    // database keeps its hash. The code is the same promise in six typable
    // digits - see generateVerificationCode for why that is safe.
    const verificationToken = generateToken();
    const verificationCode = generateVerificationCode();

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password,
          telegramUsername: input.telegramUsername || null,
          ageConfirmedAt: new Date(),
        },
        select: { id: true, role: true },
      });

      await tx.notificationPreference.create({
        data: {
          userId: created.id,
          telegramUsername: input.telegramUsername || null,
        },
      });

      await tx.authToken.create({
        data: {
          userId: created.id,
          purpose: 'EMAIL_VERIFICATION',
          tokenHash: hashToken(verificationToken),
          expiresAt: expiryFrom(new Date(), EMAIL_VERIFICATION_TTL_MS),
        },
      });

      await tx.authToken.create({
        data: {
          userId: created.id,
          purpose: 'EMAIL_VERIFICATION_CODE',
          tokenHash: hashCodeForUser(created.id, verificationCode),
          expiresAt: expiryFrom(new Date(), EMAIL_VERIFICATION_TTL_MS),
        },
      });

      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.USER_REGISTERED,
          entityType: 'User',
          entityId: created.id,
          summary: `ახალი მომხმარებელი: ${input.email}`,
          actorId: created.id,
          actorRole: created.role,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return created;
    });

    // Outside the transaction: network I/O must not hold a database lock,
    // and a failed delivery must not roll the account back.
    await sendVerificationEmail(input.email, verificationToken, verificationCode);

    const session = await createSession(user.id, context);
    await setSessionCookie(session.token, session.expiresAt);
    success = true;
  } catch (error) {
    return toActionFailure(error);
  }

  if (success) redirect('/dashboard');
  return fail(ERROR_CODES.INTERNAL);
}

/**
 * `link` is set only where nothing sends mail, so the person testing the
 * deployment can follow it instead of reading the server console.
 */
export type ResendVerificationResult = { sent: true; link: string | null };

/**
 * Issue a fresh verification link to the signed-in, still-unverified user.
 * Replaces nothing: older links simply expire on their own schedule.
 */
export async function resendVerificationAction(
  _previous: ActionResult<ResendVerificationResult> | null,
  _formData: FormData,
): Promise<ActionResult<ResendVerificationResult>> {
  try {
    const actor = await requireUser();

    if (actor.emailVerifiedAt) {
      return fail(ERROR_CODES.CONFLICT, 'ელფოსტა უკვე დადასტურებულია.');
    }

    const limit = rateLimiter.check(
      `verify-resend:${actor.userId}`,
      RATE_LIMITS.resendVerification,
    );
    if (!limit.allowed) return fail(ERROR_CODES.RATE_LIMITED);

    const token = generateToken();
    const code = generateVerificationCode();
    await prisma.$transaction([
      prisma.authToken.create({
        data: {
          userId: actor.userId,
          purpose: 'EMAIL_VERIFICATION',
          tokenHash: hashToken(token),
          expiresAt: expiryFrom(new Date(), EMAIL_VERIFICATION_TTL_MS),
        },
      }),
      /*
       * Unlike links, of which several may live side by side, only the NEWEST
       * code is valid: the banner says "type the code from the mail", and two
       * mails with two different codes make that sentence ambiguous. Replacing
       * also keeps exactly one active row, so the per-user hash cannot collide.
       */
      prisma.authToken.deleteMany({
        where: {
          userId: actor.userId,
          purpose: 'EMAIL_VERIFICATION_CODE',
          consumedAt: null,
        },
      }),
      prisma.authToken.create({
        data: {
          userId: actor.userId,
          purpose: 'EMAIL_VERIFICATION_CODE',
          tokenHash: hashCodeForUser(actor.userId, code),
          expiresAt: expiryFrom(new Date(), EMAIL_VERIFICATION_TTL_MS),
        },
      }),
    ]);

    const delivery = await sendVerificationEmail(actor.email, token, code);

    /*
     * A refused send is a FAILURE here, not a footnote. This button's only
     * job is this one send; claiming success while the provider said no
     * strands the person on an inbox that will stay empty. The provider's
     * own words are the diagnosis (a sandbox sender that only delivers to
     * the account owner, an unverified domain), so they are shown, trimmed.
     */
    if (!delivery.ok) {
      return fail(
        ERROR_CODES.INTERNAL,
        `წერილი ვერ გაიგზავნა. პროვაიდერის პასუხი: ${delivery.reason.slice(0, 180)}`,
      );
    }

    /*
     * `link` is null on any deployment that actually sends mail. It is
     * populated only when EMAIL_PROVIDER=log, where the message went to the
     * server console and the person in front of the screen has no way to read
     * it - see verificationLinkWhenUnsent.
     */
    return ok({ sent: true, link: verificationLinkWhenUnsent(token) });
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function loginAction(
  _previous: ActionResult<{ userId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  let success = false;

  try {
    const context = await requestContext();

    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ელფოსტა ან პაროლი არასწორია.');
    }

    const input = parsed.data;

    // Rate limit per address *and* per account, so neither a single IP nor a
    // distributed attempt on one account can brute force.
    for (const key of [
      `login:ip:${context.ipAddress ?? 'unknown'}`,
      `login:email:${input.email}`,
    ]) {
      if (!rateLimiter.check(key, RATE_LIMITS.login).allowed) {
        return fail(ERROR_CODES.RATE_LIMITED);
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, password: true, status: true, role: true },
    });

    const valid = user
      ? await verifyPassword(input.password, user.password)
      : // Burn comparable time so the response does not reveal whether the
        // account exists.
        await verifyPassword(input.password, DUMMY_DIGEST);

    // One message for every failure mode: wrong password, unknown account and
    // suspended account are indistinguishable to the caller.
    if (!user || !valid || user.status !== 'ACTIVE') {
      return fail(
        ERROR_CODES.UNAUTHENTICATED,
        'ელფოსტა ან პაროლი არასწორია.',
      );
    }

    rateLimiter.reset(`login:email:${input.email}`);

    const session = await createSession(user.id, context);
    await setSessionCookie(session.token, session.expiresAt);

    await writeAuditLog({
      action: AUDIT_ACTIONS.USER_LOGGED_IN,
      entityType: 'User',
      entityId: user.id,
      summary: 'შესვლა სისტემაში',
      actorId: user.id,
      actorRole: user.role,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    success = true;
  } catch (error) {
    return toActionFailure(error);
  }

  if (success) redirect('/dashboard');
  return fail(ERROR_CODES.INTERNAL);
}

export async function logoutAction(): Promise<void> {
  const actor = await readSession();

  if (actor) {
    await revokeSession(actor.sessionId);
    await writeAuditLog({
      action: AUDIT_ACTIONS.USER_LOGGED_OUT,
      entityType: 'User',
      entityId: actor.userId,
      summary: 'გამოსვლა სისტემიდან',
      actorId: actor.userId,
      actorRole: actor.role,
    });
  }

  await clearSessionCookie();
  redirect('/');
}

/**
 * Always reports success. Confirming whether an address is registered would
 * turn this endpoint into an account-enumeration oracle.
 */
export async function forgotPasswordAction(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  try {
    const context = await requestContext();

    const limit = rateLimiter.check(
      `reset:${context.ipAddress ?? 'unknown'}`,
      RATE_LIMITS.passwordReset,
    );
    if (!limit.allowed) return fail(ERROR_CODES.RATE_LIMITED);

    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get('email'),
    });
    if (!parsed.success) {
      return fail(ERROR_CODES.VALIDATION_ERROR, undefined, {
        email: ['შეიყვანეთ სწორი ელფოსტა.'],
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (user) {
      const token = generateToken();
      await prisma.authToken.create({
        data: {
          userId: user.id,
          purpose: 'PASSWORD_RESET',
          tokenHash: hashToken(token),
          expiresAt: expiryFrom(new Date(), PASSWORD_RESET_TTL_MS),
        },
      });

      await sendPasswordResetEmail(parsed.data.email, token);
    }

    return ok({ sent: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Consume an email-verification token.
 *
 * Deliberately a POST-backed action rather than something that fires on page
 * load: a link prefetch or a scanner following the URL must not be able to
 * verify an address as a side effect of a GET.
 */
export async function verifyEmailAction(
  _previous: ActionResult<{ verified: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ verified: true }>> {
  try {
    const token = String(formData.get('token') ?? '');
    if (token.length < 10) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'ბმული არასწორია.');
    }

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'ბმული აღარ მოქმედებს. მოითხოვეთ ახალი.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.authToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
    });

    return ok({ verified: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

/**
 * Verify the signed-in user's email by the 6 digit code from the mail.
 *
 * The whole security of a six digit code is HERE, not in the code: the actor
 * comes from the session (a stranger cannot aim the attempt at somebody
 * else's account), the rate limit makes guessing slower than the code's
 * lifetime, and the lookup goes through the per-user salted hash, so a code
 * issued to one account means nothing typed into another.
 */
export async function verifyEmailCodeAction(
  _previous: ActionResult<{ verified: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ verified: true }>> {
  try {
    const actor = await requireUser();
    if (actor.emailVerifiedAt) {
      return fail(ERROR_CODES.CONFLICT, 'ელფოსტა უკვე დადასტურებულია.');
    }

    // Digits only, so "123 456" or a stray space is not a wrong answer.
    const code = String(formData.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 'კოდი 6 ციფრისგან შედგება.');
    }

    const limit = rateLimiter.check(
      `verify-code:${actor.userId}`,
      RATE_LIMITS.verifyEmailCode,
    );
    if (!limit.allowed) return fail(ERROR_CODES.RATE_LIMITED);

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashCodeForUser(actor.userId, code) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });

    if (
      !record ||
      record.userId !== actor.userId ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'კოდი არასწორია ან ვადაგასულია. შეამოწმეთ ბოლო წერილი.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.authToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
    });

    revalidatePath('/dashboard');
    return ok({ verified: true });
  } catch (error) {
    return toActionFailure(error);
  }
}

export async function resetPasswordAction(
  _previous: ActionResult<{ reset: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ reset: true }>> {
  try {
    const parsed = resetPasswordSchema.safeParse({
      token: formData.get('token'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        undefined,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: { id: true, userId: true, purpose: true, expiresAt: true, consumedAt: true },
    });

    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      return fail(
        ERROR_CODES.VALIDATION_ERROR,
        'ბმული აღარ მოქმედებს. მოითხოვეთ ახალი.',
      );
    }

    const password = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { password },
      });
      await tx.authToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      await writeAuditLog(
        {
          action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
          entityType: 'User',
          entityId: record.userId,
          summary: 'პაროლი შეიცვალა აღდგენის ბმულით',
          actorId: record.userId,
        },
        tx,
      );
    });

    // Any session opened with the old password is no longer trustworthy.
    await revokeAllSessionsForUser(record.userId);

    return ok({ reset: true });
  } catch (error) {
    return toActionFailure(error);
  }
}
