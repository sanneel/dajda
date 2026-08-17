'use client';

import { useActionState } from 'react';
import { topUpBalanceAction } from '@/actions/balance';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function TopUpForm() {
  const [state, action, pending] = useActionState(topUpBalanceAction, null);

  return (
    <form action={action} className="space-y-2">
      {state && !state.ok ? (
        <Alert tone="error">
          {state.error.fieldErrors?.amountGel?.[0] ?? state.error.message}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="topup-amount" className="sr-only">
          თანხა ლარში
        </label>
        <input
          id="topup-amount"
          name="amountGel"
          type="number"
          inputMode="decimal"
          min={1}
          max={5000}
          step="0.01"
          required
          placeholder="თანხა, ₾"
          className="w-32 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink tabular"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'მუშავდება…' : 'ბალანსის შევსება'}
        </Button>
      </div>
    </form>
  );
}
