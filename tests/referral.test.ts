import { describe, expect, it } from 'vitest';
import { parseReferralCode } from '@/lib/referral-cookie';

describe('referral code', () => {
  it('accepts a profile slug', () => {
    expect(parseReferralCode('xazo25')).toBe('xazo25');
    expect(parseReferralCode('giorgi-beridze')).toBe('giorgi-beridze');
  });

  it('lowercases and trims', () => {
    expect(parseReferralCode('  Xazo25 ')).toBe('xazo25');
  });

  it('refuses anything that is not a slug', () => {
    expect(parseReferralCode(null)).toBeNull();
    expect(parseReferralCode('')).toBeNull();
    expect(parseReferralCode('-xazo')).toBeNull();
    expect(parseReferralCode('xazo-')).toBeNull();
    expect(parseReferralCode('xa zo')).toBeNull();
    expect(parseReferralCode('<script>')).toBeNull();
    expect(parseReferralCode('a'.repeat(61))).toBeNull();
  });
});
