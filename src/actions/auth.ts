'use server';

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
  hashToken,
} from '@/lib/auth/tokens';
import { AUDIT_ACTIONS, writeAuditLog } from '@/lib/audit';
import {
  getEmailSender,
  passwordResetEmail,
  verificationEmail,
} from '@/lib/email';
import { getEnv } from '@/lib/env';
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
 * Deliver the verification link. Failure is logged, never thrown: an account
 * must not fail to exist because a mail relay hiccuped - the dashboard offers
 * a resend for exactly that case.
 */
async function sendVerificationEmail(email: string, rawToken: string) {
  const env = getEnv();
  const link = `${env.APP_URL}/verify-email?token=${rawToken}`;
  const content = verificationEmail(link);
  const outcome = await getEmailSender().send({
    to: email,
    subject: content.subject,
    text: content.text,
  });
  if (!outcome.delivered) {
    console.error(
      `[dajda] verification email to ${email} failed: ${outcome.detail ?? 'unknown'}`,
    );
  }
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
    // database keeps its hash.
    const verificationToken = generateToken();

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
    await sendVerificationEmail(input.email, verificationToken);

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
 * Issue a fresh verification link to the signed-in, still-unverified user.
 * Replaces nothing: older links simply expire on their own schedule.
 */
export async function resendVerificationAction(
  _previous: ActionResult<{ sent: true }> | null,
  _formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
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
    await prisma.authToken.create({
      data: {
        userId: actor.userId,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(token),
        expiresAt: expiryFrom(new Date(), EMAIL_VERIFICATION_TTL_MS),
      },
    });

    await sendVerificationEmail(actor.email, token);

    return ok({ sent: true });
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

      const env = getEnv();
      const content = passwordResetEmail(
        `${env.APP_URL}/reset-password?token=${token}`,
      );
      const outcome = await getEmailSender().send({
        to: parsed.data.email,
        subject: content.subject,
        text: content.text,
      });
      if (!outcome.delivered) {
        console.error(
          `[dajda] password reset email failed: ${outcome.detail ?? 'unknown'}`,
        );
      }
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
