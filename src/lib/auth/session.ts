import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import {
  SESSION_TTL_MS,
  expiryFrom,
  generateToken,
  hashToken,
} from './tokens';

export const SESSION_COOKIE = 'dajda_session';

/** Only refresh `lastUsedAt` this often, to avoid a write on every request. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export type SessionActor = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  role: 'USER' | 'ANALYST' | 'ADMIN';
  emailVerifiedAt: Date | null;
  analystProfileId: string | null;
  /** Their public profile's slug, so navigation can link to it directly. */
  analystSlug: string | null;
  analystStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: getEnv().APP_URL.startsWith('https://'),
    path: '/',
    expires,
  };
}

export async function createSession(
  userId: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = expiryFrom(new Date(), SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent?.slice(0, 500) ?? null,
    },
  });

  return { token, expiresAt };
}

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', cookieOptions(new Date(0)));
}

/**
 * Resolve the caller from their session cookie.
 *
 * Returns null for every failure mode - missing, unknown, expired, revoked, or
 * belonging to a suspended user - so callers cannot accidentally distinguish
 * "no session" from "banned account".
 */
export async function readSession(): Promise<SessionActor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          analystProfile: { select: { id: true, slug: true, status: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  if (
    Date.now() - session.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
  ) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    emailVerifiedAt: session.user.emailVerifiedAt,
    analystProfileId: session.user.analystProfile?.id ?? null,
    analystSlug: session.user.analystProfile?.slug ?? null,
    analystStatus: session.user.analystProfile?.status ?? null,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Used on password change and by admins suspending an account. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
