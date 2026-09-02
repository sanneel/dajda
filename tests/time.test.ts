import { describe, expect, it } from 'vitest';
import { parseTbilisiLocal, toTbilisiLocalInput } from '@/lib/time';
import {
  createPredictionSchema,
  liveNoticeSchema,
} from '@/lib/validation/schemas';

/*
 * A `datetime-local` value is a Tbilisi wall clock. Read as the server's
 * clock (UTC when hosted) a 20:00 kickoff was stored four hours late and
 * printed as the next day, which also broke "published before the event".
 */
describe('datetime-local as Tbilisi time', () => {
  it('reads a zoneless value as UTC+4', () => {
    expect(parseTbilisiLocal('2026-09-03T20:00')?.toISOString()).toBe(
      '2026-09-03T16:00:00.000Z',
    );
    // A Tbilisi midnight is the previous UTC evening.
    expect(parseTbilisiLocal('2026-09-04T00:00')?.toISOString()).toBe(
      '2026-09-03T20:00:00.000Z',
    );
    expect(parseTbilisiLocal('2026-09-03T20:00:30')?.toISOString()).toBe(
      '2026-09-03T16:00:30.000Z',
    );
  });

  it('takes a value that carries its own zone as written', () => {
    expect(parseTbilisiLocal('2026-09-03T20:00:00Z')?.toISOString()).toBe(
      '2026-09-03T20:00:00.000Z',
    );
    expect(parseTbilisiLocal('2026-09-03T20:00:00+04:00')?.toISOString()).toBe(
      '2026-09-03T16:00:00.000Z',
    );
  });

  it('rejects non-dates and impossible calendar days', () => {
    expect(parseTbilisiLocal('')).toBeNull();
    expect(parseTbilisiLocal('soon')).toBeNull();
    expect(parseTbilisiLocal('2026-02-31T10:00')).toBeNull();
  });

  it('round-trips through the form value', () => {
    const instant = new Date('2026-09-03T16:00:00.000Z');
    expect(toTbilisiLocalInput(instant)).toBe('2026-09-03T20:00');
    expect(parseTbilisiLocal(toTbilisiLocalInput(instant))?.getTime()).toBe(
      instant.getTime(),
    );
  });

  it('is what the bet and live forms store', () => {
    const bet = createPredictionSchema.parse({
      sportId: '3c1d1f1e-6b9e-4e2b-9d6a-2b3f4a5c6d7e',
      screenshotPath: '/uploads/abcdef0123456789.webp',
      odds: '1.85',
      eventAt: '2026-09-03T20:00',
      eventEndAt: '2026-09-03T22:30',
    });
    expect(bet.eventAt?.toISOString()).toBe('2026-09-03T16:00:00.000Z');
    expect(bet.eventEndAt?.toISOString()).toBe('2026-09-03T18:30:00.000Z');

    const live = liveNoticeSchema.parse({
      bodyKa: 'ვიწყებთ ლაივს',
      liveAt: '2026-09-03T20:00',
      liveLabelKa: 'დინამო vs საბურთალო',
    });
    expect(live.liveAt.toISOString()).toBe('2026-09-03T16:00:00.000Z');

    const bad = liveNoticeSchema.safeParse({
      bodyKa: 'ვიწყებთ ლაივს',
      liveAt: 'tonight',
      liveLabelKa: 'დინამო vs საბურთალო',
    });
    expect(bad.success).toBe(false);
  });
});
