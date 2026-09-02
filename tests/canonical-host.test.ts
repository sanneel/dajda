import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from '@/lib/canonical-host';

/*
 * The www/non-www rule. The cookie is per host, so the two spellings are two
 * logins; the payment return URL is built from APP_URL, so a buyer who signed
 * in on the other spelling comes back to a page with no session. One host,
 * and only the twin is touched.
 */
describe('canonical host redirect', () => {
  const appUrl = 'https://dajda.ge';
  const at = (requestHost: string | null, pathname = '/', search = '') =>
    canonicalRedirect({ requestHost, pathname, search, appUrl });

  it('leaves the canonical host alone', () => {
    expect(at('dajda.ge', '/dashboard', '?order=dajda-1')).toBeNull();
  });

  it('sends www to the apex, keeping path and query', () => {
    expect(at('www.dajda.ge', '/dashboard', '?order=dajda-1')).toBe(
      'https://dajda.ge/dashboard?order=dajda-1',
    );
    expect(at('WWW.DAJDA.GE')).toBe('https://dajda.ge/');
    expect(at('www.dajda.ge:443', '/free')).toBe('https://dajda.ge/free');
  });

  it('sends the apex to www when www is the canonical spelling', () => {
    expect(
      canonicalRedirect({
        requestHost: 'dajda.ge',
        pathname: '/paid',
        search: '',
        appUrl: 'https://www.dajda.ge',
      }),
    ).toBe('https://www.dajda.ge/paid');
  });

  it('never touches hosts that are not the twin', () => {
    // A preview deployment, a LAN phone, localhost: all keep serving as-is.
    expect(at('dajda-git-main.vercel.app')).toBeNull();
    expect(at('192.168.2.2:3000')).toBeNull();
    expect(at('localhost:3000')).toBeNull();
    expect(at('staging.dajda.ge')).toBeNull();
    expect(at(null)).toBeNull();
  });

  it('does nothing without a usable APP_URL', () => {
    expect(
      canonicalRedirect({
        requestHost: 'www.dajda.ge',
        pathname: '/',
        search: '',
        appUrl: '',
      }),
    ).toBeNull();
  });
});
