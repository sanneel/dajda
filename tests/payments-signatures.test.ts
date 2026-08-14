import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSignatureBase,
  flittSignature,
  mapFlittStatus,
  verifyFlittSignature,
} from '@/lib/payments/flitt';
import {
  MOCK_REPLAY_WINDOW_MS,
  signMockWebhook,
  verifyMockSignature,
} from '@/lib/payments/mock';

describe('Flitt signature', () => {
  /**
   * The worked example from docs.flitt.com/api/building-signature:
   *   test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/
   * Reproducing it exactly is the strongest check available without a live
   * merchant account.
   */
  const documentedParams = {
    order_id: 'TestOrder2',
    merchant_id: 1549901,
    order_desc: 'Test payment',
    amount: 1000,
    currency: 'GEL',
    server_callback_url: 'http://myshop/callback/',
  };

  it('reproduces the documented signature base string', () => {
    expect(buildSignatureBase(documentedParams, 'test')).toBe(
      'test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/',
    );
  });

  it('sorts by key regardless of object insertion order', () => {
    const shuffled = {
      currency: 'GEL',
      server_callback_url: 'http://myshop/callback/',
      amount: 1000,
      order_id: 'TestOrder2',
      merchant_id: 1549901,
      order_desc: 'Test payment',
    };
    expect(buildSignatureBase(shuffled, 'test')).toBe(
      buildSignatureBase(documentedParams, 'test'),
    );
  });

  it('hashes with SHA-1 and lowercases the hex digest', () => {
    const expected = createHash('sha1')
      .update(
        'test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/',
        'utf8',
      )
      .digest('hex');

    expect(flittSignature(documentedParams, 'test')).toBe(expected);
    expect(flittSignature(documentedParams, 'test')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('omits absent and empty parameters', () => {
    expect(
      buildSignatureBase(
        { a: 'one', b: '', c: undefined, d: null, e: 'two' },
        'key',
      ),
    ).toBe('key|one|two');
  });

  it('keeps a zero value - 0 is not empty', () => {
    // Explicitly called out by the documentation as a common integration bug.
    expect(buildSignatureBase({ a: 0, b: 'x' }, 'key')).toBe('key|0|x');
  });

  it('excludes signature and response_signature_string from the digest', () => {
    const withExtras = {
      ...documentedParams,
      signature: 'deadbeef',
      response_signature_string: 'test|...|masked',
    };
    expect(buildSignatureBase(withExtras, 'test')).toBe(
      buildSignatureBase(documentedParams, 'test'),
    );
  });

  it('accepts a correct callback signature', () => {
    const signature = flittSignature(documentedParams, 'secret');
    expect(
      verifyFlittSignature(documentedParams, 'secret', signature),
    ).toBe(true);
  });

  it('rejects a forged signature', () => {
    expect(
      verifyFlittSignature(documentedParams, 'secret', 'a'.repeat(40)),
    ).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    const signature = flittSignature(documentedParams, 'attacker-key');
    expect(verifyFlittSignature(documentedParams, 'secret', signature)).toBe(
      false,
    );
  });

  it('rejects a signature valid for different parameters', () => {
    // Classic tamper: re-use a real signature but change the amount.
    const signature = flittSignature(documentedParams, 'secret');
    const tampered = { ...documentedParams, amount: 1 };
    expect(verifyFlittSignature(tampered, 'secret', signature)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyFlittSignature(documentedParams, 'secret', null)).toBe(false);
    expect(verifyFlittSignature(documentedParams, 'secret', '')).toBe(false);
  });
});

describe('Flitt status mapping', () => {
  it('maps the documented order_status vocabulary', () => {
    expect(mapFlittStatus('approved')).toBe('SUCCEEDED');
    expect(mapFlittStatus('declined')).toBe('FAILED');
    expect(mapFlittStatus('processing')).toBe('PROCESSING');
    expect(mapFlittStatus('created')).toBe('CREATED');
    expect(mapFlittStatus('expired')).toBe('EXPIRED');
    expect(mapFlittStatus('reversed')).toBe('REFUNDED');
  });

  it('is case and whitespace tolerant', () => {
    expect(mapFlittStatus('  APPROVED ')).toBe('SUCCEEDED');
  });

  it('returns null for an unknown status rather than assuming success', () => {
    expect(mapFlittStatus('totally_new_status')).toBeNull();
    expect(mapFlittStatus('')).toBeNull();
    expect(mapFlittStatus(null)).toBeNull();
  });
});

describe('mock provider signature', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ order_id: 'abc', order_status: 'approved' });
  const now = 1_760_000_000_000;

  it('accepts a correctly signed, fresh delivery', () => {
    const signature = signMockWebhook(body, now, secret);
    expect(
      verifyMockSignature({
        rawBody: body,
        signature,
        timestamp: String(now),
        secret,
        now,
      }),
    ).toEqual({ valid: true });
  });

  it('rejects a body that was modified after signing', () => {
    const signature = signMockWebhook(body, now, secret);
    const tampered = JSON.stringify({
      order_id: 'abc',
      order_status: 'approved',
      amount: 1,
    });

    expect(
      verifyMockSignature({
        rawBody: tampered,
        signature,
        timestamp: String(now),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'INVALID_SIGNATURE' });
  });

  it('rejects a signature made with the wrong secret', () => {
    const signature = signMockWebhook(body, now, 'wrong-secret');
    expect(
      verifyMockSignature({
        rawBody: body,
        signature,
        timestamp: String(now),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'INVALID_SIGNATURE' });
  });

  it('rejects a replayed delivery outside the freshness window', () => {
    const stale = now - MOCK_REPLAY_WINDOW_MS - 1000;
    const signature = signMockWebhook(body, stale, secret);

    expect(
      verifyMockSignature({
        rawBody: body,
        signature,
        timestamp: String(stale),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'REPLAY_WINDOW_EXCEEDED' });
  });

  it('rejects a future-dated timestamp', () => {
    const future = now + MOCK_REPLAY_WINDOW_MS + 1000;
    const signature = signMockWebhook(body, future, secret);

    expect(
      verifyMockSignature({
        rawBody: body,
        signature,
        timestamp: String(future),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'REPLAY_WINDOW_EXCEEDED' });
  });

  it('will not accept a signature moved to a different timestamp', () => {
    // The timestamp is inside the signed payload, so it cannot be swapped.
    const signature = signMockWebhook(body, now, secret);
    expect(
      verifyMockSignature({
        rawBody: body,
        signature,
        timestamp: String(now + 1000),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'INVALID_SIGNATURE' });
  });

  it('rejects missing headers', () => {
    expect(
      verifyMockSignature({
        rawBody: body,
        signature: null,
        timestamp: String(now),
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'MISSING_HEADERS' });
  });

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifyMockSignature({
        rawBody: body,
        signature: 'abc',
        timestamp: 'not-a-number',
        secret,
        now,
      }),
    ).toMatchObject({ valid: false, reason: 'BAD_TIMESTAMP' });
  });
});
