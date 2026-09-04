import { describe, expect, it } from 'vitest';
import sharp, { type OverlayOptions } from 'sharp';
import { findBookmakerLogo, scoreBookmakerLogos } from '@/lib/logo-detect';
import { LOGO_TEMPLATES } from '@/lib/bookmaker-logos.generated';

/**
 * A slip is drawn, not photographed: a light or dark card with a few lines
 * of "text" (grey bars) and, in the positive cases, one of the known logos
 * pasted in at a header-like size. The matcher must find the logo when it
 * is there and stay quiet when it is not.
 */

const WIDTH = 720;
const HEIGHT = 960;

async function slip(options: { dark?: boolean; logo?: string; logoWidth?: number }) {
  const background = options.dark ? '#14161c' : '#f5f5f5';
  const ink = options.dark ? '#d8dbe2' : '#2a2d33';
  const bars = Array.from({ length: 9 }, (_, i) => ({
    input: {
      create: {
        width: 120 + ((i * 97) % 380),
        height: 18,
        channels: 3 as const,
        background: ink,
      },
    },
    left: 48,
    top: 220 + i * 64,
  }));

  const layers: OverlayOptions[] = [...bars];
  if (options.logo) {
    const template = LOGO_TEMPLATES.find((t) => t.file === options.logo);
    if (!template) throw new Error(`no template ${options.logo}`);
    const logoWidth = options.logoWidth ?? 120;
    const logo = await sharp(Buffer.from(template.gray, 'base64'), {
      raw: { width: template.width, height: template.height, channels: 1 },
    })
      .resize({ width: logoWidth })
      .png()
      .toBuffer();
    layers.push({ input: logo, left: 48, top: 60 });
  }

  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background } })
    .composite(layers)
    .png()
    .toBuffer();
}

describe('bookmaker logo detection', () => {
  it('ships at least the Georgian bookmakers', () => {
    const brands = new Set(LOGO_TEMPLATES.map((t) => t.brand));
    for (const brand of ['Adjarabet', 'Crocobet', 'Europebet', 'Crystalbet']) {
      expect(brands.has(brand), brand).toBe(true);
    }
  });

  it('finds a pasted logo on a light slip', async () => {
    const image = await slip({ logo: '1xbet-icon.png', logoWidth: 96 });
    const found = await findBookmakerLogo(image);
    expect(found.map((m) => m.brand)).toContain('1xBet');
  }, 60_000);

  it('finds a pasted logo on a dark slip, at a different size', async () => {
    const image = await slip({ dark: true, logo: 'adjarabet-icon.png', logoWidth: 150 });
    const found = await findBookmakerLogo(image);
    expect(found.map((m) => m.brand)).toContain('Adjarabet');
  }, 60_000);

  it('stays quiet on a slip without a logo', async () => {
    const light = await slip({});
    const dark = await slip({ dark: true });
    expect(await findBookmakerLogo(light)).toEqual([]);
    expect(await findBookmakerLogo(dark)).toEqual([]);
  }, 60_000);

  it('keeps a margin between a hit and the best innocent score', async () => {
    const withLogo = await scoreBookmakerLogos(await slip({ logo: 'bet365-icon.png' }));
    const without = await scoreBookmakerLogos(await slip({}));
    const hit = withLogo.find((m) => m.brand === 'bet365');
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThan(without[0]!.score + 0.2);
  }, 60_000);
});
