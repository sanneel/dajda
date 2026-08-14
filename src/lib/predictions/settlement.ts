import type { PredictionStatus } from '@/generated/prisma/enums';

/**
 * Settlement arithmetic.
 *
 * Pure, so the money maths can be asserted directly in tests.
 *
 * There is no outcome EVALUATION here any more. A bet is a screenshot, so the
 * platform has no structured line or selection to compare a result against;
 * an admin reads the slip and decides. That is a deliberate trade: the old
 * evaluator could only ever suggest, and a suggestion derived from data the
 * platform no longer holds would be a guess dressed as a computation.
 */

export type TerminalOutcome = Extract<
  PredictionStatus,
  'WON' | 'LOST' | 'VOID' | 'PUSH'
>;

/**
 * Profit in hundredths of a unit.
 *
 *   WON       stake x (odds - 1)
 *   LOST      -stake
 *   VOID/PUSH 0, stake returned, excluded from hit rate
 *
 * Integer maths throughout: odds are thousandths, stake is hundredths, so the
 * product is divided by 1000 and rounded to the nearest hundredth of a unit.
 */
export function computeProfitUnitsCenti(
  outcome: TerminalOutcome,
  oddsMilli: number,
  stakeUnitsCenti: number,
): number {
  switch (outcome) {
    case 'WON':
      return Math.round((stakeUnitsCenti * (oddsMilli - 1000)) / 1000);
    case 'LOST':
      return -stakeUnitsCenti;
    case 'VOID':
    case 'PUSH':
      return 0;
  }
}
