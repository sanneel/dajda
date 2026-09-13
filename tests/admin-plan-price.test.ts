import { describe, expect, it } from 'vitest';
import { adminPlanPriceSchema } from '@/lib/validation/schemas';

/*
 * An administrator's price override.
 *
 * Clause 9.1 gives an AUTHOR three prices. This is not that rule relaxed: it
 * is a separate, narrower one for an administrator putting a live payment
 * through the real gateway for a lari instead of thirty. What keeps it
 * narrow is the range and the required reason, so both are pinned here.
 */

const UUID = '00000000-0000-4000-8000-000000000001';
const valid = { analystProfileId: UUID, priceGel: '1', reason: 'Flitt ტესტი' };

describe('an administrator repricing a plan', () => {
  it('accepts the control, so the refusals below mean something', () => {
    expect(adminPlanPriceSchema.safeParse(valid).success).toBe(true);
  });

  it('takes 1 lari, which is the point of it existing', () => {
    const parsed = adminPlanPriceSchema.safeParse(valid);
    expect(parsed.success && parsed.data.priceGel).toBe(100);
  });

  it("takes Flitt's own test amount", () => {
    // 0.10 GEL is what their risk team asked for on a live card.
    const parsed = adminPlanPriceSchema.safeParse({ ...valid, priceGel: '0.10' });
    expect(parsed.success && parsed.data.priceGel).toBe(10);
  });

  it('still converts a published tier exactly', () => {
    const parsed = adminPlanPriceSchema.safeParse({ ...valid, priceGel: '30' });
    expect(parsed.success && parsed.data.priceGel).toBe(3000);
  });

  it('refuses free, which is not a price but a giveaway', () => {
    for (const priceGel of ['0', '-1', '0.05']) {
      expect(adminPlanPriceSchema.safeParse({ ...valid, priceGel }).success).toBe(
        false,
      );
    }
  });

  it('refuses more than the terms name anywhere', () => {
    // Nothing above the top published tier could be legitimate, whoever types it.
    for (const priceGel of ['51', '500', '100000']) {
      expect(adminPlanPriceSchema.safeParse({ ...valid, priceGel }).success).toBe(
        false,
      );
    }
  });

  it('refuses a price that is not a number', () => {
    for (const priceGel of ['abc', '', 'NaN', 'Infinity']) {
      expect(adminPlanPriceSchema.safeParse({ ...valid, priceGel }).success).toBe(
        false,
      );
    }
  });

  it('demands a reason, because this departs from the published price', () => {
    for (const reason of ['', '  ', 'ok']) {
      expect(adminPlanPriceSchema.safeParse({ ...valid, reason }).success).toBe(
        false,
      );
    }
  });

  it('refuses an analyst id that is not one', () => {
    expect(
      adminPlanPriceSchema.safeParse({ ...valid, analystProfileId: 'me' })
        .success,
    ).toBe(false);
  });
});
