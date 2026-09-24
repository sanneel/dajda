import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { uploadPathSchema } from '@/lib/validation/schemas';
import { decodeAndReencode, MAX_INPUT_PIXELS } from '@/lib/uploads';

/*
 * Screenshots are the product's only upload surface, and `screenshotPath` is
 * written straight onto a public record. The path that reaches the database
 * must therefore be one of our own generated filenames and nothing else: this
 * schema is what stops a crafted form value from pointing a bet at an
 * arbitrary file, and what the serving route's own name check mirrors.
 */
describe('stored upload paths', () => {
  const valid = '/uploads/0123456789abcdef0123456789abcdef.webp';

  it('accepts a generated name', () => {
    expect(uploadPathSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['traversal', '/uploads/../../.env'],
    ['nested traversal', '/uploads/a/../../etc/passwd'],
    ['absolute elsewhere', '/etc/passwd'],
    ['remote url', 'https://elsewhere.example/x.webp'],
    ['protocol relative', '//elsewhere.example/x.webp'],
    ['svg, which can carry script', '/uploads/0123456789abcdef.svg'],
    ['no extension', '/uploads/0123456789abcdef'],
    ['double extension', '/uploads/0123456789abcdef.webp.html'],
    ['uppercase hex outside the charset', '/uploads/0123456789ABCDEF0123.webp'],
    ['too short to be random', '/uploads/abc.webp'],
    ['wrong directory', '/public/0123456789abcdef0123.webp'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(uploadPathSchema.safeParse(value).success).toBe(false);
  });

  it('accepts the other formats the store can emit', () => {
    // storeScreenshot only writes .webp today, but the schema allows the two
    // other raster types so a future change to the encoder does not silently
    // start failing validation.
    expect(
      uploadPathSchema.safeParse('/uploads/0123456789abcdef0123.jpg').success,
    ).toBe(true);
    expect(
      uploadPathSchema.safeParse('/uploads/0123456789abcdef0123.png').success,
    ).toBe(true);
  });
});

describe('decoded image size', () => {
  const png = async (width: number, height: number) => {
    const bytes = await sharp({
      create: { width, height, channels: 3, background: '#f5f5f5' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return new File([new Uint8Array(bytes)], 'slip.png', { type: 'image/png' });
  };

  it('refuses a small file that declares an enormous image', async () => {
    // One flat colour compresses to almost nothing, so the byte cap alone
    // let through a file that decodes to 81 million pixels.
    const bomb = await png(9000, 9000);
    expect(bomb.size).toBeLessThan(2 * 1024 * 1024);
    expect(9000 * 9000).toBeGreaterThan(MAX_INPUT_PIXELS);
    await expect(decodeAndReencode(bomb)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('გარჩევადობა'),
    });
  });

  it('still takes a large phone-sized photo and scales it down', async () => {
    const photo = await png(6000, 4000);
    const out = await decodeAndReencode(photo);
    expect(out.info.width).toBe(2000);
    expect(out.info.format).toBe('webp');
  });
});
