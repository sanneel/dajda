'use client';

import { useActionState, useState } from 'react';
import { setAnalystPlanPriceAction } from '@/actions/admin';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';

/**
 * An administrator's price override, behind a disclosure.
 *
 * Folded away by default, because it is not part of reviewing an author: the
 * price is the author's own choice under clause 9.1 and this steps outside
 * it. Open, it says so, asks what for, and prints the published tiers beside
 * the field so the person typing 1 can see what they are departing from.
 */
export function PlanPriceForm({
  analystProfileId,
  currentPriceMinor,
  currentBillingPeriod,
}: {
  analystProfileId: string;
  /** null when the author has not activated a subscription at all. */
  currentPriceMinor: number | null;
  currentBillingPeriod: 'MONTHLY' | 'DAILY';
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    setAnalystPlanPriceAction,
    null,
  );

  if (currentPriceMinor === null) {
    return (
      <p className="text-xs text-ink-faint">
        გამოწერა გააქტიურებული არ არის — ფასს ჯერ ავტორი აყენებს.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center text-sm font-medium text-accent hover:underline"
      >
        ფასის შეცვლა
      </button>
    );
  }

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form
      action={action}
      className="space-y-3 rounded-card border border-line bg-canvas p-3"
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="analystProfileId" value={analystProfileId} />

      {state?.ok ? (
        <Alert tone="success">
          შეინახა: {(state.data.priceMinor / 100).toFixed(2)} ლარი{' '}
          {state.data.billingPeriod === 'DAILY' ? 'დღეში' : 'თვეში'}.
        </Alert>
      ) : null}
      {state && !state.ok && !fieldErrors ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,10rem)_1fr]">
        <div>
          <label
            htmlFor={`price-${analystProfileId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            ფასი (ლარი)
          </label>
          <input
            id={`price-${analystProfileId}`}
            name="priceGel"
            type="number"
            step="0.01"
            min="0.1"
            max="50"
            required
            defaultValue={(currentPriceMinor / 100).toFixed(2)}
            aria-invalid={fieldErrors?.priceGel ? true : undefined}
            className="tabular min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          />
          {fieldErrors?.priceGel?.[0] ? (
            <p className="mt-1 text-xs text-loss" role="alert">
              {fieldErrors.priceGel[0]}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={`period-${analystProfileId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            პერიოდი
          </label>
          <select
            id={`period-${analystProfileId}`}
            name="billingPeriod"
            defaultValue={currentBillingPeriod}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="MONTHLY">თვე</option>
            <option value="DAILY">დღე (ტესტი)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`reason-${analystProfileId}`}
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            მიზეზი
          </label>
          <input
            id={`reason-${analystProfileId}`}
            name="reason"
            required
            minLength={3}
            placeholder="მაგ: გადახდის ტესტი Flitt-ზე"
            aria-invalid={fieldErrors?.reason ? true : undefined}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          />
          {fieldErrors?.reason?.[0] ? (
            <p className="mt-1 text-xs text-loss" role="alert">
              {fieldErrors.reason[0]}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        წესების 9.1-ით ავტორი ირჩევს 30, 40 ან 50 ლარს. აქ დაყენებული სხვა
        ფასი ადმინისტრაციის გადაწყვეტილებაა და ჟურნალში იწერება. არსებულ
        გამომწერებს არ ეხება — ისინი იმ ფასით რჩებიან, რითიც იყიდეს.
      </p>

      <p className="text-xs text-ink-faint">
        დღიური პერიოდი მხოლოდ ტესტისთვისაა: ბარათი ჩამოიჭრება ყოველ დღე,
        მაქსიმუმ 7-ჯერ. ამ დროს ნაყიდი გამოწერა დღიური რჩება, თვეზე
        დაბრუნების შემდეგაც, სანამ არ გაუქმდება.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'ინახება…' : 'შენახვა'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          გაუქმება
        </Button>
      </div>
    </form>
  );
}
