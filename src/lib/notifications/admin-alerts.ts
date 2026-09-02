import { prisma } from '@/lib/db';
import { renderBetFinishedAlert } from './admin-alert-text';
import { flushTelegramOutbox } from './telegram-sender';

/**
 * Messages to the administrator, as opposed to an author's audience.
 *
 * Settlement is manual: an author says "this match is over", and only an
 * administrator decides whether the bet won, against a named source. That
 * handoff is worthless if nobody notices it, and the administrator is not
 * sitting in the review queue at midnight when the matches end. So the
 * handoff itself sends a Telegram message, immediately and inline, to every
 * administrator who has linked the bot from their own settings page.
 *
 * The address is never typed anywhere in this file or in an env var: an admin
 * links their chat exactly the way a reader does (settings, Telegram, Start),
 * which is what makes the chat id theirs. Whoever holds the ADMIN role and has
 * done that gets the alerts; nobody else can.
 *
 * Delivered through the same outbox as everything else, so a failed send is
 * a PENDING row the cron sweep retries, and the admin notifications page
 * shows what happened either way.
 */

export {
  renderBetFinishedAlert,
  SETTLEMENT_QUEUE_PATH,
  type BetFinishedAlertInput,
} from './admin-alert-text';

/**
 * Tell every linked administrator that a bet is waiting to be settled.
 *
 * Never throws: the author's handoff must not fail because Telegram was
 * slow, and a row left PENDING is exactly what the cron sweep is for.
 */
export async function notifyAdminsBetFinished(
  predictionId: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const none = { sent: 0, failed: 0, skipped: 0 };
  try {
    const prediction = await prisma.prediction.findUnique({
      where: { id: predictionId },
      select: {
        id: true,
        titleKa: true,
        oddsMilli: true,
        eventAt: true,
        resultScreenshotPath: true,
        sport: { select: { nameKa: true } },
        author: { select: { displayName: true } },
        postedBy: { select: { name: true } },
      },
    });
    if (!prediction) return none;

    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        telegramChatId: { not: null },
        notificationPrefs: { telegramEnabled: true },
      },
      select: { id: true, telegramChatId: true },
    });
    if (admins.length === 0) return none;

    const message = renderBetFinishedAlert({
      predictionId: prediction.id,
      titleKa: prediction.titleKa,
      authorName: prediction.author?.displayName ?? prediction.postedBy.name,
      sportName: prediction.sport.nameKa,
      oddsMilli: prediction.oddsMilli,
      eventAt: prediction.eventAt,
      hasResultScreenshot: prediction.resultScreenshotPath !== null,
    });

    const rows = await prisma.notification.createManyAndReturn({
      data: admins.map((admin) => ({
        userId: admin.id,
        channel: 'TELEGRAM' as const,
        status: 'PENDING' as const,
        destination: admin.telegramChatId,
        predictionId: prediction.id,
        ...message,
      })),
      select: { id: true },
    });

    const flushed = await flushTelegramOutbox({
      ids: rows.map((row) => row.id),
      limit: rows.length,
    });
    return { ...flushed, skipped: 0 };
  } catch (error) {
    console.error('[dajda] admin bet-finished alert failed', error);
    return none;
  }
}
