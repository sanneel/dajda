import { describe, expect, it } from 'vitest';
import {
  LIVE_TEST_MAX_RENEWALS,
  LIVE_TEST_ORDER_PREFIX,
  openCancellationTest,
  stopTestCalendar,
} from '@/lib/subscriptions/live-test';
import { AppError, ERROR_CODES } from '@/lib/errors';

/*
 * The two guards on a control that charges a live card.
 *
 * Both refuse before anything reaches the gateway, which is what makes them
 * testable without one - and what makes them worth pinning: past them, money
 * moves.
 */

const ADMIN = { userId: '00000000-0000-4000-8000-000000000001' };

async function refusal(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected a refusal, got none');
}

describe('the live cancellation test', () => {
  it('stops only its own orders, never a customer subscription', async () => {
    for (const orderId of [
      'dajda-4934826a-2aab-4d71-b0ef-a7738cbc391e',
      'dajda-topup-1',
      'canceltest',
      `not-${LIVE_TEST_ORDER_PREFIX}-a-1234`,
    ]) {
      const error = await refusal(() => stopTestCalendar(ADMIN, orderId));
      expect(error.code).toBe(ERROR_CODES.FORBIDDEN);
    }
  });

  it('refuses a start the gateway cannot be asked for', async () => {
    // Days, because that is the only unit the gateway schedules in; a past
    // date is not a schedule, and beyond a week the answer arrives too late
    // to be the reason this exists rather than a monthly plan.
    for (const days of [-1, 8, 30, 0.5, Number.NaN]) {
      const error = await refusal(() =>
        openCancellationTest(ADMIN, { startInDays: days }),
      );
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it('bounds the calendar low enough that a failed stop is affordable', () => {
    // The product's bound is nominal because a subscription runs until it is
    // canceled. Here it is the backstop for the cancellation being tested.
    expect(LIVE_TEST_MAX_RENEWALS).toBeLessThanOrEqual(3);
  });
});
