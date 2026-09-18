import { describe, expect, it } from 'vitest';
import { imageAccess } from '@/lib/uploads-access';

const open = { lockedForViewer: false, lockedForEveryone: false };
const bought = { lockedForViewer: false, lockedForEveryone: true };
const shut = { lockedForViewer: true, lockedForEveryone: true };

describe('who may fetch a stored image', () => {
  it('serves what no ticket claims to everybody', () => {
    expect(imageAccess({ slips: [], results: [] })).toBe('public');
  });

  it('caches a slip that is open to a stranger', () => {
    expect(imageAccess({ slips: [open], results: [] })).toBe('public');
  });

  it('serves a paid slip to its buyer without letting a cache keep it', () => {
    expect(imageAccess({ slips: [bought], results: [] })).toBe('private');
  });

  it('refuses a paid slip to anyone who has not paid', () => {
    expect(imageAccess({ slips: [shut], results: [] })).toBe('denied');
  });

  it('never makes a result photo public', () => {
    expect(imageAccess({ slips: [open], results: [{ visibleToViewer: false }] })).toBe(
      'private',
    );
    expect(imageAccess({ slips: [], results: [{ visibleToViewer: false }] })).toBe(
      'denied',
    );
    expect(imageAccess({ slips: [], results: [{ visibleToViewer: true }] })).toBe(
      'private',
    );
  });
});
