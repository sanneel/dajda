import { prisma } from '@/lib/db';
import {
  renderBetFinishedAlert,
  renderPayoutRequestedAlert,
} from './admin-alert-text';
import { flushTelegramOutbox } from './telegram-sender';

/**
 * Messages to the administrator, as opposed to an author's audience.
 *
 * Two handoffs need a person who is not sitting in the admin pages. Settlement
 * is manual: an author says "this match is over", and only an administrator
 * decides whether the bet won, against a named source. And a payout is manual:
 * an author asks, and only an administrator can move the money, from the bank.
 * Either handoff is worthless if nobody notices it, so each one sends a
 * Telegram message, immediately and inline, to every administrator who has
 * linked the bot from their own settings page.
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
  PAYOUT_QUEUE_PATH,
  renderBetFinishedAlert,
  renderPayoutRequestedAlert,
  SETTLEMENT_QUEUE_PATH,
  type BetFinishedAlertInput,
  type PayoutRequestedAlertInput,
} from './admin-alert-text';

type AlertOutcome = { sent: number; failed: number; skipped: number };

const NONE: AlertOutcome = { sent: 0, failed: 0, skipped: 0 };

/** Write one PENDING row per linked administrator and send them now. */
async function sendToLinkedAdmins(
  message: { subjectKa: string; bodyKa: string; linkPath: string },
  link: { predictionId?: string } = {},
): Promise<AlertOutcome> {
  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
      status: 'ACTIVE',
      telegramChatId: { not: null },
      notificationPrefs: { telegramEnabled: true },
    },
    select: { id: true, telegramChatId: true },
  });
  if (admins.length === 0) return NONE;

  const rows = await prisma.notification.createManyAndReturn({
    data: admins.map((admin) => ({
      userId: admin.id,
      channel: 'TELEGRAM' as const,
      status: 'PENDING' as const,
      destination: admin.telegramChatId,
      predictionId: link.predictionId ?? null,
      ...message,
    })),
    select: { id: true },
  });

  const flushed = await flushTelegramOutbox({
    ids: rows.map((row) => row.id),
    limit: rows.length,
  });
  return { ...flushed, skipped: 0 };
}

/**
 * Tell every linked administrator that a bet is waiting to be settled.
 *
 * Never throws: the author's handoff must not fail because Telegram was
 * slow, and a row left PENDING is exactly what the cron sweep is for.
 */
export async function notifyAdminsBetFinished(
  predictionId: string,
): Promise<AlertOutcome> {
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
    if (!prediction) return NONE;

    const message = renderBetFinishedAlert({
      predictionId: prediction.id,
      titleKa: prediction.titleKa,
      authorName: prediction.author?.displayName ?? prediction.postedBy.name,
      sportName: prediction.sport.nameKa,
      oddsMilli: prediction.oddsMilli,
      eventAt: prediction.eventAt,
      hasResultScreenshot: prediction.resultScreenshotPath !== null,
    });

    return await sendToLinkedAdmins(message, { predictionId: prediction.id });
  } catch (error) {
    console.error('[dajda] admin bet-finished alert failed', error);
    return NONE;
  }
}

/**
 * Tell every linked administrator that an author has asked to be paid.
 *
 * Never throws, for the same reason: the request is already recorded and the
 * earnings already held, and a Telegram hiccup must not turn that into an
 * error the author sees.
 */
export async function notifyAdminsPayoutRequested(
  payoutId: string,
): Promise<AlertOutcome> {
  try {
    const payout = await prisma.analystPayout.findUnique({
      where: { id: payoutId },
      select: {
        amountMinor: true,
        currency: true,
        maskedAccount: true,
        activityCheckPassed: true,
        analystProfile: { select: { displayName: true } },
      },
    });
    if (!payout) return NONE;

    return await sendToLinkedAdmins(
      renderPayoutRequestedAlert({
        authorName: payout.analystProfile.displayName,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        maskedAccount: payout.maskedAccount,
        activityCheckPassed: payout.activityCheckPassed,
      }),
    );
  } catch (error) {
    console.error('[dajda] admin payout-requested alert failed', error);
    return NONE;
  }
}
