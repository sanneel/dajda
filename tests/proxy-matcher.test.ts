import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '@/proxy';

/*
 * Which requests pay for the proxy. Pages need it for the CSP nonce and the
 * www redirect; the API mostly needs neither, except the two prefixes the
 * browser navigates to with cookies, which must still be sent to the
 * canonical host.
 */
describe('proxy matcher', () => {
  const runs = (url: string) =>
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  it('runs on pages', () => {
    expect(runs('/')).toBe(true);
    expect(runs('/analysts/giorgi-beridze')).toBe(true);
    expect(runs('/free/286d2475-51e0-411c-8391-00bd83ce8c04')).toBe(true);
    expect(runs('/admin/payouts')).toBe(true);
  });

  it('runs on the API routes the browser navigates to with cookies', () => {
    expect(runs('/api/auth/google')).toBe(true);
    expect(runs('/api/auth/google/callback')).toBe(true);
    expect(runs('/api/payments/return')).toBe(true);
  });

  it('skips the rest of the API', () => {
    expect(runs('/api/analysts')).toBe(false);
    expect(runs('/api/analysts/giorgi-beridze')).toBe(false);
    expect(runs('/api/free')).toBe(false);
    expect(runs('/api/health')).toBe(false);
    expect(runs('/api/cron/notifications')).toBe(false);
    expect(runs('/api/cron/payments')).toBe(false);
    expect(runs('/api/dev/simulate-payment')).toBe(false);
    expect(runs('/api/webhooks/telegram')).toBe(false);
    // Under /api/webhooks, not /api/payments, so the payment webhook is out.
    expect(runs('/api/webhooks/payments/flitt')).toBe(false);
  });

  it('skips static assets', () => {
    expect(runs('/_next/static/chunks/main.js')).toBe(false);
    expect(runs('/icon.svg')).toBe(false);
    expect(runs('/opengraph-image.png')).toBe(false);
  });
});
