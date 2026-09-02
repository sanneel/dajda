import { formatDateTimeKa, formatOdds } from '@/lib/format';

/**
 * The wording of administrator alerts, apart from the database and the bot
 * so a test can pin it down. `admin-alerts.ts` is the side that sends.
 */

export type BetFinishedAlertInput = {
  predictionId: string;
  titleKa: string;
  authorName: string;
  sportName: string;
  oddsMilli: number;
  eventAt: Date | null;
  hasResultScreenshot: boolean;
};

/** Where the message points: the review queue, filtered to what is waiting. */
export const SETTLEMENT_QUEUE_PATH = '/admin/predictions?review=awaiting';

/**
 * The text, kept pure so the wording can be pinned down in a test without a
 * database or a bot.
 */
export function renderBetFinishedAlert(input: BetFinishedAlertInput): {
  subjectKa: string;
  bodyKa: string;
  linkPath: string;
} {
  const lines = [
    `${input.authorName} მონიშნა ფსონი დასრულებულად. შეამოწმეთ შედეგი და დაითვალეთ.`,
    '',
    `სპორტი: ${input.sportName}`,
    `კოეფიციენტი: ${formatOdds(input.oddsMilli)}`,
    input.eventAt ? `მატჩი: ${formatDateTimeKa(input.eventAt)}` : null,
    `შედეგის სკრინი: ${input.hasResultScreenshot ? 'თან ერთვის' : 'არ არის'}`,
  ].filter((line): line is string => line !== null);

  return {
    subjectKa: `დასათვლელია: ${input.titleKa}`,
    bodyKa: lines.join('\n'),
    linkPath: SETTLEMENT_QUEUE_PATH,
  };
}
