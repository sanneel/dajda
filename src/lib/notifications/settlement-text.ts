import type {
  PredictionStatus,
  PredictionVisibility,
} from '@/generated/prisma/enums';
import { formatOdds, formatUnitsSigned } from '@/lib/format';
import { PREDICTION_STATUS_KA, PREDICTION_VISIBILITY_KA } from '@/lib/labels';

/**
 * What an author's audience is told when one of their tickets is settled,
 * apart from the database so a test can pin it down.
 *
 * The audience includes followers who never paid, and a paid pick's title IS
 * the merchandise: settling does not open it (see isTicketLocked). So only a
 * free ticket names itself, the same rule notifyNewBet follows for a new one.
 * The link leads to the author, where each reader's gate decides what shows.
 */
export function renderSettlementNotice(input: {
  status: PredictionStatus;
  visibility: PredictionVisibility;
  titleKa: string;
  oddsMilli: number;
  profitUnitsCenti: number;
  authorName: string;
}): { subjectKa: string; bodyKa: string } {
  const units = `ერთეულები: ${formatUnitsSigned(input.profitUnitsCenti)}`;
  const what =
    input.visibility === 'PUBLIC'
      ? input.titleKa
      : `${PREDICTION_VISIBILITY_KA[input.visibility]} ბილეთი · კოეფ. ${formatOdds(input.oddsMilli)}`;

  return {
    subjectKa: `შედეგი: ${PREDICTION_STATUS_KA[input.status] ?? input.status} · ${input.authorName}`,
    bodyKa: `${what}\n${units}`,
  };
}
