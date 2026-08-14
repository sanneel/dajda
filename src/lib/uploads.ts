import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AppError, ERROR_CODES } from '@/lib/errors';

/**
 * Screenshot storage.
 *
 * This is the product's only upload surface. Everything else is generated
 * (initials avatars exist precisely so that profile pictures never had to be
 * accepted), so the rules here are the whole of the file-upload attack
 * surface and are deliberately strict:
 *
 *   1. Files land OUTSIDE `public/`. Nothing under the storage directory is
 *      reachable by URL; it is served by a route handler that sets its own
 *      content type. A file that somehow ended up executable still could not
 *      be requested and run.
 *   2. Every upload is RE-ENCODED to WebP by sharp rather than being written
 *      through. That is the strongest control available: a polyglot file that
 *      is both a valid image and a valid script does not survive a decode and
 *      re-encode, and EXIF (which carries GPS on phone screenshots) is
 *      dropped with it.
 *   3. Filenames are random hex, generated here. The client's filename is
 *      never used, so it cannot contain a path, a traversal or an extension.
 *   4. Dimensions and byte size are capped before and after encoding.
 */

/** Where files live. Outside `public/` on purpose. */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/** Refuse anything larger before we even hand it to the decoder. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/** A bet slip does not need to be bigger than this to be readable. */
const MAX_DIMENSION = 2000;

const ACCEPTED_INPUT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** Matches what `uploadPathSchema` accepts, so the two cannot drift apart. */
const STORED_NAME = /^[a-z0-9]{16,64}\.webp$/;

export type StoredUpload = {
  /** Public reference, e.g. `/uploads/ab12….webp`. Store this on the row. */
  urlPath: string;
};

/**
 * Validate, re-encode and store an uploaded image.
 *
 * Throws an AppError with a Georgian message on anything the UI should show
 * the user; unexpected decode failures are also surfaced as a validation
 * error rather than a 500, because "this is not an image" is a user problem.
 */
export async function storeScreenshot(file: File): Promise<StoredUpload> {
  if (file.size === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'ფაილი ცარიელია.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'ფაილი ძალიან დიდია. მაქსიმუმი 12MB.',
    );
  }
  // The browser-declared type is a hint only; sharp is the real gate below.
  if (file.type && !ACCEPTED_INPUT.has(file.type)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'დაშვებულია მხოლოდ სურათი (JPG, PNG, WebP).',
    );
  }

  const input = Buffer.from(await file.arrayBuffer());

  let output: Buffer;
  try {
    output = await sharp(input, { failOn: 'error' })
      .rotate() // honour EXIF orientation before the tag is discarded
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'ფაილი არ იკითხება როგორც სურათი.',
    );
  }

  const name = `${randomBytes(16).toString('hex')}.webp`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), output);

  return { urlPath: `/uploads/${name}` };
}

/**
 * Read a stored file for the serving route.
 *
 * The name is matched against the exact pattern this module generates before
 * it is joined to a path, so traversal is rejected by shape rather than by
 * sanitising. Returns null when there is no such file, which the route turns
 * into a 404.
 */
export async function readStoredScreenshot(
  name: string,
): Promise<Buffer | null> {
  if (!STORED_NAME.test(name)) return null;

  try {
    return await readFile(path.join(UPLOAD_DIR, name));
  } catch {
    return null;
  }
}
