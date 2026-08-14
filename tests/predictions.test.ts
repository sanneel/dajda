import { describe, expect, it } from 'vitest';
import {
  EDITABLE_AFTER_PUBLISH,
  FROZEN_FIELDS,
  classifyEdit,
  isEditable,
} from '@/lib/predictions/immutability';
import { computeProfitUnitsCenti } from '@/lib/predictions/settlement';

describe('prediction immutability', () => {
  const published = { publishedAt: new Date('2026-08-01T10:00:00Z') };
  const draft = { publishedAt: null };

  it('allows any change while the prediction is an unpublished draft', () => {
    const result = classifyEdit(draft, ['oddsMilli', 'screenshotPath', 'titleKa']);
    expect(result.outcome).toBe('APPLIED');
  });

  it.each(FROZEN_FIELDS)(
    'refuses to change %s after publication',
    (field) => {
      const result = classifyEdit(published, [field]);
      expect(result.outcome).toBe('REJECTED_IMMUTABLE');
      if (result.outcome !== 'REJECTED_IMMUTABLE') return;
      expect(result.frozenAttempted).toContain(field);
    },
  );

  it.each(EDITABLE_AFTER_PUBLISH)(
    'allows %s to be edited after publication',
    (field) => {
      expect(classifyEdit(published, [field]).outcome).toBe('APPLIED');
    },
  );

  it('rejects the whole edit when any frozen field is touched', () => {
    const result = classifyEdit(published, ['titleKa', 'oddsMilli']);
    expect(result.outcome).toBe('REJECTED_IMMUTABLE');
    if (result.outcome !== 'REJECTED_IMMUTABLE') return;
    expect(result.frozenAttempted).toEqual(['oddsMilli']);
  });

  it('rejects unknown fields rather than letting them through', () => {
    // Default-deny: a field nobody listed is not silently editable.
    const result = classifyEdit(published, ['someNewColumn']);
    expect(result.outcome).toBe('REJECTED_IMMUTABLE');
  });

  it('treats a settled prediction as closed', () => {
    expect(
      isEditable({ publishedAt: new Date(), status: 'WON', supersededAt: null }),
    ).toBe(false);
    expect(
      isEditable({
        publishedAt: new Date(),
        status: 'PENDING',
        supersededAt: null,
      }),
    ).toBe(true);
  });

  it('treats a superseded version as closed', () => {
    expect(
      isEditable({
        publishedAt: new Date(),
        status: 'PENDING',
        supersededAt: new Date(),
      }),
    ).toBe(false);
  });
});

describe('profit arithmetic', () => {
  it('pays stake x (odds - 1) on a win', () => {
    // 1 unit at 1.85 returns 0.85 units of profit.
    expect(computeProfitUnitsCenti('WON', 1850, 100)).toBe(85);
    // 2 units at 2.50 returns 3.00 units.
    expect(computeProfitUnitsCenti('WON', 2500, 200)).toBe(300);
  });

  it('loses exactly the stake on a loss', () => {
    expect(computeProfitUnitsCenti('LOST', 1850, 100)).toBe(-100);
    expect(computeProfitUnitsCenti('LOST', 9999, 250)).toBe(-250);
  });

  it('returns zero for VOID and PUSH', () => {
    expect(computeProfitUnitsCenti('VOID', 1850, 100)).toBe(0);
    expect(computeProfitUnitsCenti('PUSH', 1850, 100)).toBe(0);
  });

  it('rounds to the nearest hundredth of a unit', () => {
    // 1 unit at 1.333 -> 0.333 units -> 33 centi.
    expect(computeProfitUnitsCenti('WON', 1333, 100)).toBe(33);
  });

  it('never produces a fractional integer', () => {
    for (const odds of [1010, 1333, 1857, 2001, 7777]) {
      for (const stake of [25, 50, 100, 175]) {
        expect(Number.isInteger(computeProfitUnitsCenti('WON', odds, stake))).toBe(
          true,
        );
      }
    }
  });
});
