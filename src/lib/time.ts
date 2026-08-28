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
