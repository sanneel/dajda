import { findBookmakerLogo } from '@/lib/logo-detect';

/**
 * Does an uploaded slip show a bookmaker?
 *
 * The author agreement forbids a bookmaker's logo or name on a screenshot,
 * because the platform sells analysis, not a bookmaker. Authors crop or
 * cover it before uploading; this check is the reminder for the ones who
 * forget, at the moment they can still fix it. It runs locally, by matching
 * the image against the logos in assets/bookmaker-logos - nothing leaves
 * the server and nothing about the bet itself is read.
 *
 * Fails open. A decode failure or a matcher error must not stop an author
 * from posting: the check is a courtesy, the agreement is the rule, and an
 * admin sees every original screenshot anyway.
 */

export type SlipScreening =
  | { checked: false }
  | { checked: true; flagged: false }
  | { checked: true; flagged: true; brands: string[] };

export async function screenSlipForBookmakerBranding(
  file: File,
): Promise<SlipScreening> {
  try {
    const matches = await findBookmakerLogo(Buffer.from(await file.arrayBuffer()));
    return matches.length > 0
      ? { checked: true, flagged: true, brands: matches.map((m) => m.brand) }
      : { checked: true, flagged: false };
  } catch (error) {
    // Logged, not raised: see the note at the top.
    console.warn('[dajda] slip screening skipped', error);
    return { checked: false };
  }
}

/** The message the author sees when a slip is refused. */
export function brandingRefusalMessage(brands: string[]): string {
  const named = brands.length > 0 ? ` (${brands.join(', ')})` : '';
  return `სკრინშოტზე ჩანს ბუკმეკერის ლოგო ან სახელი${named}. ავტორის ხელშეკრულებით ეს დაუშვებელია: გადაფარეთ ან მოჭერით და ატვირთეთ თავიდან.`;
}
