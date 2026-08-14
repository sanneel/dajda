import { describe, expect, it } from 'vitest';
import { uploadPathSchema } from '@/lib/validation/schemas';

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
