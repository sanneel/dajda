import { describe, expect, it } from 'vitest';
import {
  buildReturnUrl,
  resolveReturnRedirect,
  safeDestination,
} from '@/lib/payments/return-url';

const APP = 'https://dajda.ge';

describe('payment return hop', () => {
  it('builds a response_url that carries the order and the destination', () => {
    const url = new URL(buildReturnUrl(APP, 'dajda-topup-1', '/dashboard'));
    expect(url.pathname).toBe('/api/payments/return');
    expect(url.searchParams.get('order')).toBe('dajda-topup-1');
    expect(url.searchParams.get('to')).toBe('/dashboard');
  });

  it('redirects to the destination with the order from the query', () => {
    const to = resolveReturnRedirect(
      APP,
      `${APP}/api/payments/return?order=dajda-topup-1&to=%2Fdashboard`,
      null,
    );
    expect(to).toBe(`${APP}/dashboard?order=dajda-topup-1`);
  });

  it('falls back to the order id the gateway posted', () => {
    const to = resolveReturnRedirect(
      APP,
      `${APP}/api/payments/return?to=%2Ffree%2Fabc`,
      'dajda-ticket-9',
    );
    expect(to).toBe(`${APP}/free/abc?order=dajda-ticket-9`);
  });

  it('drops an order id that is not one of ours', () => {
    const to = resolveReturnRedirect(
      APP,
      `${APP}/api/payments/return?order=<script>&to=%2Fdashboard`,
      null,
    );
    expect(to).toBe(`${APP}/dashboard`);
  });

  it('never leaves the site', () => {
    expect(safeDestination('https://evil.example/')).toBe('/dashboard');
    expect(safeDestination('//evil.example')).toBe('/dashboard');
    expect(safeDestination('/\\evil.example')).toBe('/dashboard');
    expect(safeDestination(undefined)).toBe('/dashboard');
    expect(safeDestination('/free/abc')).toBe('/free/abc');
    const to = resolveReturnRedirect(
      APP,
      `${APP}/api/payments/return?order=dajda-1&to=https%3A%2F%2Fevil.example`,
      null,
    );
    expect(to.startsWith(`${APP}/dashboard`)).toBe(true);
  });
});
