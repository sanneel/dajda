import { createRequire } from 'node:module';
import sharp from 'sharp';
import { LOGO_TEMPLATES, type LogoTemplate } from './bookmaker-logos.generated';

/*
 * opencv.js is a CommonJS script whose export is a thenable: under ESM
 * interop the module namespace inherits `then`, and both static import
 * and `await import()` then blow up ("then called on incompatible
 * receiver"). require() hands back the export as it is.
 */
const require = createRequire(import.meta.url);

/**
 * Find a bookmaker's logo in a slip screenshot, locally.
 *
 * Normalised cross-correlation template matching (OpenCV, WebAssembly, no
 * network): each known logo is slid over the slip at a ladder of sizes, and
 * the best correlation decides. The slip is matched both as it is and
 * inverted, because the same wordmark is dark-on-light in one app theme and
 * light-on-dark in the other, and correlation cares about that.
 *
 * What this can and cannot do: it recognises the logos it has been given,
 * at roughly the sizes a screenshot shows them, upright. A logo cropped in
 * half, rotated or drawn in an unknown variant gets through; a plain
 * wordmark set in the app's own font also gets through when the template
 * is only the app icon. It is a net with a known mesh, not a judge.
 */

export type LogoMatch = {
  brand: string;
  /** Peak correlation, 0..1. */
  score: number;
  /** Where in the slip, in slip pixels after downscaling. */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Correlation at or above this counts as the logo being there. */
const LOGO_MATCH_THRESHOLD = 0.72;

/**
 * The slip is reduced to this width before matching. The cost of a check
 * grows with the slip's area, and at 900 a phone screenshot took about 3.4 s.
 * 600 takes about 40% less and still flagged every logo the 900 run did on
 * the test slips; at 450 the bet365 icon fell below the threshold, so this
 * is close to the floor.
 */
const SLIP_WIDTH = 600;

/**
 * Template widths to try, as a fraction of the slip width. A bookmaker's
 * mark on a phone screenshot is somewhere between a favicon in a header
 * and a splash-screen wordmark.
 */
const SCALE_LADDER = [0.06, 0.08, 0.1, 0.13, 0.16, 0.2, 0.25, 0.32, 0.4];

type CV = typeof import('@techstark/opencv-js');

let ready: Promise<CV> | null = null;

/** opencv.js initialises asynchronously; wait for it once per process. */
function loadCv(): Promise<CV> {
  if (ready) return ready;
  ready = (async () => {
    const mod = require('@techstark/opencv-js') as unknown;
    if (mod instanceof Promise) return (await mod) as CV;
    const cv = mod as CV & { onRuntimeInitialized?: () => void };
    if (cv.Mat) return cv;
    await new Promise<void>((resolve) => {
      cv.onRuntimeInitialized = () => resolve();
    });
    return cv;
  })();
  return ready;
}

type GrayImage = { width: number; height: number; data: Buffer };

async function toGray(input: Buffer, width: number): Promise<GrayImage> {
  const { data, info } = await sharp(input)
    .rotate() // honour EXIF orientation: a phone screenshot is stored upright, a photo may not be
    .resize({ width, withoutEnlargement: true, kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: Buffer.from(data) };
}

/*
 * Resized templates, kept for the life of the process. Almost every slip is
 * reduced to the same SLIP_WIDTH, so the same few dozen sizes come up on
 * every check; building them once saves sharp a resize per size per slip.
 */
const sizedTemplates = new WeakMap<LogoTemplate, Map<number, Promise<GrayImage | null>>>();

function sizedTemplate(template: LogoTemplate, width: number): Promise<GrayImage | null> {
  let byWidth = sizedTemplates.get(template);
  if (!byWidth) {
    byWidth = new Map();
    sizedTemplates.set(template, byWidth);
  }
  let sized = byWidth.get(width);
  if (!sized) {
    sized = resizeTemplate(template, width);
    // A failed resize is not remembered, so the next slip tries again.
    sized.catch(() => byWidth.delete(width));
    byWidth.set(width, sized);
  }
  return sized;
}

async function resizeTemplate(template: LogoTemplate, width: number): Promise<GrayImage | null> {
  const height = Math.round((template.height * width) / template.width);
  if (width < 12 || height < 8) return null;
  const { data, info } = await sharp(Buffer.from(template.gray, 'base64'), {
    raw: { width: template.width, height: template.height, channels: 1 },
  })
    .resize({ width, height, kernel: 'lanczos3' })
    // Resizing promotes a raw single channel to three; bring it back down,
    // or the pixel buffer is three times what the Mat expects.
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) {
    throw new Error(`template resize produced ${info.channels} channels`);
  }
  return { width: info.width, height: info.height, data: Buffer.from(data) };
}

function matFromGray(cv: CV, image: GrayImage) {
  const mat = new cv.Mat(image.height, image.width, cv.CV_8UC1);
  mat.data.set(image.data);
  return mat;
}

/**
 * Best correlation of one template over the slip, across the scale ladder,
 * both as the slip is and inverted. Returns null when the template never
 * fits.
 *
 * The inverted slip needs no pass of its own. TM_CCOEFF_NORMED subtracts
 * each window's mean, and inverting (255 - p) negates every pixel's distance
 * from that mean while leaving the normalising term alone, so the inverted
 * slip's score at every position is exactly the negative of the straight
 * one. The straight match is the peak of one result, the inverted match is
 * its trough, sign flipped. That halves the most expensive work in a check.
 */
function bestMatch(
  cv: CV,
  slipMat: InstanceType<CV['Mat']>,
  sized: GrayImage[],
): Omit<LogoMatch, 'brand'> | null {
  let straight: Omit<LogoMatch, 'brand'> | null = null;
  let flipped: Omit<LogoMatch, 'brand'> | null = null;
  for (const image of sized) {
    if (image.width >= slipMat.cols || image.height >= slipMat.rows) continue;
    const tmpl = matFromGray(cv, image);
    const result = new cv.Mat();
    const noMask = new cv.Mat();
    try {
      cv.matchTemplate(slipMat, tmpl, result, cv.TM_CCOEFF_NORMED);
      const { maxVal, maxLoc, minVal, minLoc } = cv.minMaxLoc(result, noMask);
      const size = { width: image.width, height: image.height };
      if (!straight || maxVal > straight.score) {
        straight = { score: maxVal, x: maxLoc.x, y: maxLoc.y, ...size };
      }
      if (!flipped || -minVal > flipped.score) {
        flipped = { score: -minVal, x: minLoc.x, y: minLoc.y, ...size };
      }
    } finally {
      tmpl.delete();
      result.delete();
      noMask.delete();
    }
  }
  return straight && (!flipped || straight.score >= flipped.score) ? straight : flipped;
}

/**
 * Every template's best score against the slip, strongest first. Callers
 * decide what to do with a score; `findBookmakerLogo` applies the threshold.
 */
export async function scoreBookmakerLogos(
  input: Buffer,
  templates: LogoTemplate[] = LOGO_TEMPLATES,
): Promise<LogoMatch[]> {
  const cv = await loadCv();
  const slip = await toGray(input, SLIP_WIDTH);
  const slipMat = matFromGray(cv, slip);

  const matches: LogoMatch[] = [];
  try {
    for (const template of templates) {
      const sized = (
        await Promise.all(
          SCALE_LADDER.map((fraction) =>
            sizedTemplate(template, Math.round(slip.width * fraction)),
          ),
        )
      ).filter((image): image is GrayImage => image !== null);

      const best = bestMatch(cv, slipMat, sized);
      if (best) matches.push({ brand: template.brand, ...best });
    }
  } finally {
    slipMat.delete();
  }

  return matches.sort((a, b) => b.score - a.score);
}

/** The brands whose logo is in the slip, best match first; empty when none. */
export async function findBookmakerLogo(
  input: Buffer,
  threshold: number = LOGO_MATCH_THRESHOLD,
): Promise<LogoMatch[]> {
  const matches = await scoreBookmakerLogos(input);
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (match.score < threshold || seen.has(match.brand)) return false;
    seen.add(match.brand);
    return true;
  });
}
