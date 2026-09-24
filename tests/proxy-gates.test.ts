import { describe, expect, it } from 'vitest';
import { earlyGate } from '@/lib/proxy-gates';

/*
 * What the proxy answers before a page renders. Pages stream, so once one has
 * started it can only reply 200; these two cases need a real status instead.
 */
describe('proxy early gate', () => {
  const signedOut = { hasSessionCookie: false, paymentProvider: 'flitt' };
  const signedIn = { hasSessionCookie: true, paymentProvider: 'flitt' };

  it('sends a visitor with no session to /login from the signed-in areas', () => {
    for (const path of [
      '/account',
      '/admin',
      '/admin/payouts',
      '/analyst',
      '/analyst/earnings',
      '/apply',
      '/feed',
    ]) {
      expect(earlyGate(path, signedOut), path).toEqual({ redirect: '/login' });
    }
  });

  it('leaves public pages alone, including the ones that only look similar', () => {
    for (const path of [
      '/',
      '/analysts/giorgi-beridze',
      '/free',
      '/paid',
      '/accounting',
      '/feedback',
      '/login',
    ]) {
      expect(earlyGate(path, signedOut), path).toBeNull();
    }
  });

  it('lets any session cookie through; the layout decides whether it is valid', () => {
    expect(earlyGate('/account', signedIn)).toBeNull();
    expect(earlyGate('/admin', signedIn)).toBeNull();
  });

  it('hides the payment simulator unless the mock provider is on', () => {
    expect(earlyGate('/dev/checkout', signedIn)).toEqual({ notFound: true });
    expect(earlyGate('/dev', signedOut)).toEqual({ notFound: true });
    expect(
      earlyGate('/dev/checkout', { hasSessionCookie: false, paymentProvider: 'mock' }),
    ).toBeNull();
    expect(earlyGate('/developers', signedOut)).toBeNull();
  });
});
