/**
 * The product's clock.
 *
 * Georgia has been on UTC+4 with no daylight saving since 2005, so a fixed
 * offset is correct rather than an approximation.
 *
 * DAJDA is a Georgian product with a Georgian audience, so every instant a
 * reader is shown is a Tbilisi wall clock, not the server's. Formatting in UTC
 * moves an evening kickoff back four hours and, for anything stamped at a
 * Tbilisi midnight, shows the day before.
 */
export const TBILISI_UTC_OFFSET_MINUTES = 4 * 60;

/**
 * The same instant, shifted so that the UTC getters read Tbilisi wall-clock
 * fields. The returned Date is NOT the same moment in time and must only be
 * read through getUTC*, never stored or compared.
 */
export function tbilisiClock(instant: Date): Date {
  return new Date(instant.getTime() + TBILISI_UTC_OFFSET_MINUTES * 60_000);
}

/**
 * A `datetime-local` value, read as a Tbilisi wall clock.
 *
 * The browser control produces "2026-09-03T20:00" with no zone. `new Date()`
 * on that string uses the SERVER's zone, which on a hosted deployment is UTC,
 * so an author typing 20:00 had the kickoff stored as 20:00Z and printed back
 * as 00:00 the next day. Every author of this product types Tbilisi time, so
 * that is what a zoneless value means here.
 *
 * A value that does carry a zone ("...Z", "...+04:00") is taken as written.
 * Returns null for anything that is not a date at all.
 */
export function parseTbilisiLocal(value: string): Date | null {
  const trimmed = value.trim();
  const local =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      trimmed,
    );

  if (!local) {
    const zoned = new Date(trimmed);
    return Number.isNaN(zoned.getTime()) ? null : zoned;
  }

  const [, y, mo, d, h, mi, s, ms] = local;
  const utcOfWallClock = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
    Number((ms ?? '0').padEnd(3, '0')),
  );
  if (Number.isNaN(utcOfWallClock)) return null;

  const instant = new Date(utcOfWallClock - TBILISI_UTC_OFFSET_MINUTES * 60_000);
  // Reject "2026-02-31": Date.UTC silently rolls it into March.
  const check = tbilisiClock(instant);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return instant;
}

/**
 * The inverse: an instant as the "YYYY-MM-DDTHH:mm" a `datetime-local`
 * control expects, on the Tbilisi clock. For pre-filling a form.
 */
export function toTbilisiLocalInput(instant: Date): string {
  const d = tbilisiClock(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The wall-clock fields an instant has in Tbilisi. */
export function tbilisiParts(instant: Date): {
  year: number;
  month: number;
  day: number;
} {
  const shifted = tbilisiClock(instant);
  return {
    year: shifted.getUTCFullYear(),
    // Calendar month, 1 to 12, rather than the zero based one.
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}
