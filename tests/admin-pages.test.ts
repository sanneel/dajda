import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Every admin page and route checks for an administrator itself.
 *
 * The admin layout's check does not guard its pages: an RSC request can ask
 * for the page segment alone and the layout never runs (see the Next docs on
 * authentication, "Layout checks"). One page relied on the layout, and a
 * crafted request with any cookie at all read it.
 */
const ADMIN_DIR = join(__dirname, '..', 'src', 'app', 'admin');

const entries = readdirSync(ADMIN_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /^(page|route)\.tsx?$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name));

describe('admin pages', () => {
  it('finds the pages to check', () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  for (const file of entries) {
    it(`${relative(ADMIN_DIR, file).replaceAll('\\', '/')} calls requireAdmin`, () => {
      expect(readFileSync(file, 'utf8')).toMatch(/await requireAdmin\(\)/);
    });
  }
});
