import { beforeEach, describe, expect, it } from 'vitest';
import type { PaymentStatus } from '@/generated/prisma/enums';
import {
  addBillingPeriod,
  canTransition,
  processPaymentWebhook,
  type PaymentSnapshot,
  type WebhookPort,
} from '@/lib/payments/webhook';
import type { WebhookResult } from '@/lib/payments/types';

/**
 * Webhook application rules, exercised against an in-memory port.
 *
 * The central guarantee: a subscription becomes ACTIVE only as the result of a
 * signature-verified delivery that moves a matching payment to SUCCEEDED.
 */

type Recorded = {
  events: {
    id: string;
    providerCode: string;
    eventId: string;
    signatureValid: boolean;
    processedAs?: string;
  }[];
  transitions: { paymentId: string; from: PaymentStatus; to: PaymentStatus }[];
  activations: { subscriptionId: string; currentPeriodEnd: Date }[];
  deactivations: { subscriptionId: string; reason: string }[];
};

function makePort(payment: PaymentSnapshot | null) {
  const recorded: Recorded = {
    events: [],
    transitions: [],
    activations: [],
    deactivations: [],
  };

  let counter = 0;
  let current = payment;

  const port: WebhookPort = {
    async recordEvent(input) {
      const existing = recorded.events.find(
        (event) =>
          event.providerCode === input.providerCode &&
          event.eventId === input.eventId,
      );
      // Mirrors the unique index on (providerCode, eventId).
      if (existing) return { id: existing.id, duplicate: true };

      counter += 1;
      const id = `event-${counter}`;
      recorded.events.push({ id, ...input });
      return { id, duplicate: false };
    },

    async markProcessed(eventRowId, result) {
      const event = recorded.events.find((entry) => entry.id === eventRowId);
      if (event) event.processedAs = result;
    },

    async findPaymentByOrderId() {
      return current;
    },

    async transitionPayment(input) {
      recorded.transitions.push({
        paymentId: input.paymentId,
        from: input.from,
        to: input.to,
      });
      if (current) current = { ...current, status: input.to };
    },

    async activateSubscription(input) {
      recorded.activations.push({
        subscriptionId: input.subscriptionId,
        currentPeriodEnd: input.currentPeriodEnd,
      });
    },

    async deactivateSubscription(input) {
      recorded.deactivations.push(input);
    },
  };

  return { port, recorded };
}

const PAYMENT: PaymentSnapshot = {
  id: 'payment-1',
  userId: 'user-1',
  planId: 'plan-1',
  subscriptionId: 'sub-1',
  status: 'CREATED',
  amountMinor: 2900,
  currency: 'GEL',
  billingPeriod: 'MONTHLY',
};

function result(overrides: Partial<WebhookResult> = {}): WebhookResult {
  return {
    eventId: 'evt-1',
    signatureValid: true,
    orderId: 'dajda-order-1',
    providerPaymentId: 'pay-123',
    status: 'SUCCEEDED',
    rawStatus: 'approved',
    amountMinor: 2900,
    currency: 'GEL',
    maskedCard: '444455XXXXXX1111',
    cardType: 'VISA',
    rrn: null,
    payload: {},
    ...overrides,
  };
}

describe('transition rules', () => {
  it('permits the normal forward path', () => {
    expect(canTransition('CREATED', 'PROCESSING')).toBe(true);
    expect(canTransition('CREATED', 'SUCCEEDED')).toBe(true);
    expect(canTransition('PROCESSING', 'SUCCEEDED')).toBe(true);
    expect(canTransition('SUCCEEDED', 'REFUNDED')).toBe(true);
    expect(canTransition('SUCCEEDED', 'DISPUTED')).toBe(true);
  });

  it('refuses to walk a payment backwards', () => {
    expect(canTransition('SUCCEEDED', 'PROCESSING')).toBe(false);
    expect(canTransition('SUCCEEDED', 'CREATED')).toBe(false);
    expect(canTransition('SUCCEEDED', 'FAILED')).toBe(false);
  });

  it('treats failure states as terminal', () => {
    expect(canTransition('FAILED', 'SUCCEEDED')).toBe(false);
    expect(canTransition('CANCELED', 'SUCCEEDED')).toBe(false);
    expect(canTransition('EXPIRED', 'SUCCEEDED')).toBe(false);
  });
});

describe('addBillingPeriod', () => {
  it('advances one month for a monthly plan', () => {
    expect(
      addBillingPeriod(new Date('2026-01-15T00:00:00Z'), 'MONTHLY')
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-02-15');
  });

  it('advances three months for a quarterly plan', () => {
    expect(
      addBillingPeriod(new Date('2026-01-15T00:00:00Z'), 'QUARTERLY')
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-04-15');
  });
});

describe('processPaymentWebhook', () => {
  let port: WebhookPort;
  let recorded: Recorded;

  beforeEach(() => {
    ({ port, recorded } = makePort({ ...PAYMENT }));
  });

  it('activates the subscription on a verified approval', async () => {
    const outcome = await processPaymentWebhook('mock', result(), port);

    expect(outcome.action).toBe('APPLIED');
    expect(outcome.subscriptionActivated).toBe(true);
    expect(recorded.transitions).toEqual([
      { paymentId: 'payment-1', from: 'CREATED', to: 'SUCCEEDED' },
    ]);
    expect(recorded.activations).toHaveLength(1);
  });

  it('records the delivery even when the signature is invalid', async () => {
    const outcome = await processPaymentWebhook(
      'mock',
      result({ signatureValid: false, rejectionReason: 'INVALID_SIGNATURE' }),
      port,
    );

    expect(outcome.action).toBe('REJECTED_SIGNATURE');
    expect(outcome.subscriptionActivated).toBe(false);
    // Nothing was applied…
    expect(recorded.transitions).toHaveLength(0);
    expect(recorded.activations).toHaveLength(0);
    // …but the attempt is on the record.
    expect(recorded.events).toHaveLength(1);
    expect(recorded.events[0]?.signatureValid).toBe(false);
  });

  it('ignores a duplicate delivery of the same event', async () => {
    const first = await processPaymentWebhook('mock', result(), port);
    const second = await processPaymentWebhook('mock', result(), port);

    expect(first.action).toBe('APPLIED');
    expect(second.action).toBe('DUPLICATE_IGNORED');
    expect(second.subscriptionActivated).toBe(false);

    // The important part: exactly one activation, not two.
    expect(recorded.activations).toHaveLength(1);
    expect(recorded.transitions).toHaveLength(1);
  });

  it('processes distinct events separately', async () => {
    await processPaymentWebhook('mock', result({ eventId: 'evt-1' }), port);
    const second = await processPaymentWebhook(
      'mock',
      result({
        eventId: 'evt-2',
        status: 'REFUNDED',
        rawStatus: 'reversed',
      }),
      port,
    );

    expect(second.action).toBe('APPLIED');
    expect(recorded.deactivations).toHaveLength(1);
  });

  it('never activates on an unrecognised status', async () => {
    const outcome = await processPaymentWebhook(
      'mock',
      result({ status: null, rawStatus: 'some_new_status' }),
      port,
    );

    expect(outcome.action).toBe('UNKNOWN_STATUS');
    expect(outcome.subscriptionActivated).toBe(false);
    expect(recorded.transitions).toHaveLength(0);
    expect(recorded.events[0]?.processedAs).toContain('needs review');
  });

  it('rejects a callback whose amount does not match the payment', async () => {
    // Guards against a forged or altered callback buying a plan for 1 tetri.
    const outcome = await processPaymentWebhook(
      'mock',
      result({ amountMinor: 1 }),
      port,
    );

    expect(outcome.action).toBe('AMOUNT_MISMATCH');
    expect(recorded.activations).toHaveLength(0);
  });

  it('rejects a callback in a different currency', async () => {
    const outcome = await processPaymentWebhook(
      'mock',
      result({ currency: 'USD' }),
      port,
    );

    expect(outcome.action).toBe('AMOUNT_MISMATCH');
    expect(recorded.activations).toHaveLength(0);
  });

  it('reports a missing order id', async () => {
    const outcome = await processPaymentWebhook(
      'mock',
      result({ orderId: null }),
      port,
    );
    expect(outcome.action).toBe('MISSING_ORDER_ID');
  });

  it('reports an unknown payment', async () => {
    const { port: emptyPort } = makePort(null);
    const outcome = await processPaymentWebhook('mock', result(), emptyPort);
    expect(outcome.action).toBe('PAYMENT_NOT_FOUND');
  });

  it('ignores a late delivery that would move the payment backwards', async () => {
    const { port: succeededPort, recorded: log } = makePort({
      ...PAYMENT,
      status: 'SUCCEEDED',
    });

    const outcome = await processPaymentWebhook(
      'mock',
      result({ eventId: 'evt-late', status: 'PROCESSING', rawStatus: 'processing' }),
      succeededPort,
    );

    expect(outcome.action).toBe('TRANSITION_NOT_ALLOWED');
    expect(log.transitions).toHaveLength(0);
  });

  it('ends access when a payment is refunded', async () => {
    const { port: paidPort, recorded: log } = makePort({
      ...PAYMENT,
      status: 'SUCCEEDED',
    });

    await processPaymentWebhook(
      'mock',
      result({ eventId: 'evt-refund', status: 'REFUNDED', rawStatus: 'reversed' }),
      paidPort,
    );

    expect(log.deactivations).toEqual([
      { subscriptionId: 'sub-1', reason: 'payment refunded' },
    ]);
  });

  it('ends access on a chargeback', async () => {
    const { port: paidPort, recorded: log } = makePort({
      ...PAYMENT,
      status: 'SUCCEEDED',
    });

    await processPaymentWebhook(
      'mock',
      result({ eventId: 'evt-dispute', status: 'DISPUTED', rawStatus: 'disputed' }),
      paidPort,
    );

    expect(log.deactivations).toHaveLength(1);
  });

  it('does not activate anything when a payment fails', async () => {
    const outcome = await processPaymentWebhook(
      'mock',
      result({ status: 'FAILED', rawStatus: 'declined' }),
      port,
    );

    expect(outcome.action).toBe('APPLIED');
    expect(outcome.subscriptionActivated).toBe(false);
    expect(recorded.activations).toHaveLength(0);
  });

  it('skips activation when the payment has no subscription attached', async () => {
    const { port: looseP, recorded: log } = makePort({
      ...PAYMENT,
      subscriptionId: null,
    });

    const outcome = await processPaymentWebhook('mock', result(), looseP);
    expect(outcome.action).toBe('APPLIED');
    expect(outcome.subscriptionActivated).toBe(false);
    expect(log.activations).toHaveLength(0);
  });

  it('sets the period end from the plan billing period', async () => {
    const now = new Date('2026-08-11T00:00:00Z');
    await processPaymentWebhook('mock', result(), port, now);

    expect(recorded.activations[0]?.currentPeriodEnd.toISOString()).toBe(
      new Date('2026-09-11T00:00:00Z').toISOString(),
    );
  });
});
