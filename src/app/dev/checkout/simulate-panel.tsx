'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

type SimulationResult = {
  webhookStatus: number;
  action: string | null;
  eventId: string;
};

/**
 * Fires the simulated gateway callback and reports exactly what the webhook
 * processor decided - including "DUPLICATE_IGNORED", so idempotency can be
 * observed by replaying the same event id.
 */
export function SimulatePaymentPanel({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState<string | null>(null);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  async function simulate(outcome: string, replay = false) {
    setPending(replay ? 'replay' : outcome);
    setError(null);

    try {
      const body = new FormData();
      body.set('orderId', orderId);
      body.set('outcome', outcome);
      if (replay && lastEventId) body.set('replayEventId', lastEventId);

      const response = await fetch('/api/dev/simulate-payment', {
        method: 'POST',
        body,
      });
      const payload = (await response.json()) as
        | { ok: true; data: SimulationResult }
        | { ok: false; error: { message: string } };

      if (!payload.ok) {
        setError(payload.error.message);
        return;
      }

      setLastEventId(payload.data.eventId);
      setResults((previous) => [payload.data, ...previous]);
    } catch {
      setError('სიმულაცია ვერ შესრულდა.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => simulate('approved')}
          disabled={pending !== null}
        >
          {pending === 'approved' ? 'იგზავნება…' : 'წარმატებული გადახდა'}
        </Button>

        <Button
          type="button"
          variant="danger"
          onClick={() => simulate('declined')}
          disabled={pending !== null}
        >
          {pending === 'declined' ? 'იგზავნება…' : 'უარყოფილი გადახდა'}
        </Button>

        {lastEventId ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => simulate('approved', true)}
            disabled={pending !== null}
          >
            {pending === 'replay' ? 'იგზავნება…' : 'იმავე event-ის გამეორება'}
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {results.length > 0 ? (
        <div className="rounded border border-line bg-canvas p-3">
          <p className="text-xs font-medium text-ink-muted">
            webhook-ის შედეგები
          </p>
          <ul className="mt-2 space-y-1">
            {results.map((result, index) => (
              <li
                key={`${result.eventId}-${index}`}
                className="tabular text-xs text-ink-muted"
              >
                HTTP {result.webhookStatus} ·{' '}
                <span
                  className={
                    result.action === 'APPLIED'
                      ? 'text-ink'
                      : result.action === 'DUPLICATE_IGNORED'
                        ? 'text-ink-muted italic'
                        : 'text-ink-faint'
                  }
                >
                  {result.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
