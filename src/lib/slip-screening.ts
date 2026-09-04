import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@/lib/env';

/**
 * Does an uploaded slip show a bookmaker or casino?
 *
 * The author agreement forbids a bookmaker's logo or name on a screenshot,
 * because the platform sells analysis, not a bookmaker. Authors crop or
 * cover it before uploading; this check is the reminder for the ones who
 * forget, at the moment they can still fix it. The model looks at the image
 * and answers one question; nothing about the bet itself is read or kept.
 *
 * Fails open. A missing key, a timeout or an API error must not stop an
 * author from posting: the check is a courtesy, the agreement is the rule,
 * and an admin sees every original screenshot anyway.
 */

export type SlipScreening =
  | { checked: false }
  | { checked: true; flagged: false }
  | { checked: true; flagged: true; brands: string[] };

const SUPPORTED_MEDIA = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

type SupportedMedia = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const SYSTEM_PROMPT = `You review screenshots of sports betting slips uploaded to a Georgian analytics platform. The platform's rule: a screenshot must not show the logo, name or other branding of a bookmaker, betting site or casino (for example Adjarabet, Crocobet, Europebet, Betlive, Leaderbet, Crystalbet, Mostbet, 1xBet, Betsson, Bet365, or any other). Odds, team names, markets, stakes, dates and the slip layout are fine.

Answer with one line of JSON and nothing else: {"branding": true|false, "brands": ["..."]}. Set "branding" to true only when a bookmaker or casino logo, wordmark or name is actually visible in the image. List the names you can identify in "brands"; use [] when there are none or the brand is unreadable.`;

/** The model needs the image as it was uploaded; big slips are already limited by the upload cap. */
async function toBase64(file: File): Promise<string> {
  return Buffer.from(await file.arrayBuffer()).toString('base64');
}

function parseAnswer(text: string): { branding: boolean; brands: string[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      branding?: unknown;
      brands?: unknown;
    };
    if (typeof parsed.branding !== 'boolean') return null;
    const brands = Array.isArray(parsed.brands)
      ? parsed.brands.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
      : [];
    return { branding: parsed.branding, brands };
  } catch {
    return null;
  }
}

export async function screenSlipForBookmakerBranding(
  file: File,
): Promise<SlipScreening> {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return { checked: false };
  if (!SUPPORTED_MEDIA.has(file.type)) return { checked: false };

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    // A slip is one small image; an answer that takes longer than this is
    // not worth holding the author's form for.
    timeout: 25_000,
    maxRetries: 1,
  });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 256,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.type as SupportedMedia,
                data: await toBase64(file),
              },
            },
            {
              type: 'text',
              text: 'Is a bookmaker or casino logo or name visible in this slip?',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return { checked: false };

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const answer = parseAnswer(text);
    if (!answer) return { checked: false };

    return answer.branding
      ? { checked: true, flagged: true, brands: answer.brands }
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
