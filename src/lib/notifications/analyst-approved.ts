import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { flushEmailOutbox } from './email-sender';
import { flushTelegramOutbox } from './telegram-sender';

/**
 * Telling an applicant they are now an author.
 *
 * Approval happens in the admin pages while the applicant is somewhere else,
 * and nothing on the site announces it: they found out only by opening the
 * author page on the off chance. So the decision is sent to them, by email
 * and, if they linked the bot, on Telegram.
 *
 * Not a preference, like a verification mail: it is the answer to something
 * they asked for, and it comes once. It still goes through the outbox, so a
 * failed send is a row the cron sweep retries and the admin notifications
 * page shows what happened.
 */

/** Where an approved author starts: the page with the onboarding notice. */
export const ANALYST_HOME_PATH = '/analyst';

/** The text, kept pure so the wording can be pinned down in a test. */
export function renderAnalystApprovedNotice(input: { displayName: string }): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  return {
    // No "DAJDA:" prefix: the sender already says so, and an outbox subject
    // doubles as the heading under the wordmark and as Telegram's first line.
    subjectKa: 'ანალიტიკოსის პროფილი დადასტურდა',
    bodyKa: [
      `„${input.displayName}“ დადასტურებულია, უკვე შეგიძლიათ ბილეთების დამატება.`,
      'ანალიტიკოსის გვერდზე ნახავთ, როგორ განსხვავდება უფასო, ფასიანი და გამოწერის ბილეთები.',
    ].join('\n'),
    linkPath: ANALYST_HOME_PATH,
  };
}

/**
 * Queue the notice for the profile's owner and send it now.
 *
 * Called after the approval has committed, and never throws: the decision is
 * already recorded, and a slow mail provider must not turn it into an error
 * on the admin's screen. A row left PENDING is what the cron sweep is for.
 */
export async function notifyAnalystApproved(
  analystProfileId: string,
): Promise<void> {
  try {
    const profile = await prisma.analystProfile.findUnique({
      where: { id: analystProfileId },
      select: {
        displayName: true,
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            telegramChatId: true,
            notificationPrefs: { select: { telegramEnabled: true } },
          },
        },
      },
    });
    if (!profile || profile.user.status !== 'ACTIVE') return;

    const { user } = profile;
    const message = renderAnalystApprovedNotice({
      displayName: profile.displayName,
    });

    const rows: Prisma.NotificationCreateManyInput[] = [
      {
        ...message,
        userId: user.id,
        channel: 'EMAIL',
        status: 'PENDING',
        destination: user.email,
      },
    ];
    // Telegram only where the person pressed Start and left it switched on:
    // the chat id is theirs, and the switch is how they said to use it.
    if (user.telegramChatId && user.notificationPrefs?.telegramEnabled) {
      rows.push({
        ...message,
        userId: user.id,
        channel: 'TELEGRAM',
        status: 'PENDING',
        destination: user.telegramChatId,
      });
    }

    const created = await prisma.notification.createManyAndReturn({
      data: rows,
      select: { id: true },
    });
    const ids = created.map((row) => row.id);

    await Promise.allSettled([
      flushEmailOutbox({ ids, limit: ids.length }),
      flushTelegramOutbox({ ids, limit: ids.length }),
    ]);
  } catch (error) {
    console.error('[dajda] analyst-approved notice failed', error);
  }
}
