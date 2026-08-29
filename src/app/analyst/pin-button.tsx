'use client';

import { useState, useTransition } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { togglePinBetAction } from '@/actions/analyst';

/**
 * The pin toggle on a published bet row.
 *
 * Optimism is deliberately absent: the action can refuse (the three-pin cap),
 * so the label only flips on a confirmed answer and the refusal is shown in
 * place, where the button is.
 */
export function PinBetButton({
  predictionId,
  pinned,
}: {
  predictionId: string;
  pinned: boolean;
}) {
  const [isPinned, setPinned] = useState(pinned);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await togglePinBetAction(predictionId);
            if (result.ok) setPinned(result.data.pinned);
            else setError(result.error.message ?? 'ვერ შესრულდა.');
          })
        }
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-control border px-2.5 text-xs transition-colors ${
          isPinned
            ? 'border-accent text-accent'
            : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
        }`}
      >
        {isPinned ? (
          <>
            <PinOff className="size-3.5" aria-hidden="true" />
            მოხსნა
          </>
        ) : (
          <>
            <Pin className="size-3.5" aria-hidden="true" />
            ტოპ ბილეთებში
          </>
        )}
      </button>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </span>
  );
}
