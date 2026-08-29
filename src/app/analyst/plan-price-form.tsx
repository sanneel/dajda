'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setPlanPriceAction } from '@/actions/analyst';
import { Button } from '@/components/ui/button';

const PRICES = [
  { minor: 3000, label: '30 ₾' },
  { minor: 4000, label: '40 ₾' },
  { minor: 5000, label: '50 ₾' },
] as const;

/**
 * Where the analyst picks what their subscription costs.
 *
 * Three fixed prices, not a free field, because clause 9.1 of the terms
 * names exactly these. Radio buttons drawn as buttons: the choice is the
 * whole form, so it should look like one.
 */
export function PlanPriceForm({
  currentPriceMinor,
}: {
  currentPriceMinor: number | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setPlanPriceAction, null);

  // The page around this form renders the saved price server-side, so a
  // successful save refreshes it rather than duplicating that rendering here.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={action}
      className="space-y-3"
      // React 19 resets the form after every action; canceling the reset
      // keeps what was typed (see register-form for the full story).
      onReset={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="თვიური ფასი">
        {PRICES.map((price) => (
          <label
            key={price.minor}
            className="relative inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line-strong px-5 text-base font-semibold text-ink transition-colors hover:border-ink-faint has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent"
          >
            <input
              type="radio"
              name="priceMinor"
              value={price.minor}
              defaultChecked={currentPriceMinor === price.minor}
              className="sr-only"
              required
            />
            {price.label}
            <span className="ml-1.5 text-xs font-normal text-ink-faint">
              /თვე
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? 'ინახება…'
            : currentPriceMinor === null
              ? 'გამოწერის გააქტიურება'
              : 'ფასის შენახვა'}
        </Button>
        {state?.ok ? <span className="text-sm text-win">შენახულია.</span> : null}
        {state && !state.ok ? (
          <span className="text-sm text-loss">{state.error.message}</span>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        ფასის შეცვლა არსებულ გამომწერებს არ ეხება: ისინი აგრძელებენ იმ ფასად,
        რომლითაც გამოიწერეს. ახალი ფასი მოქმედებს შემდეგი გამომწერისთვის.
      </p>
    </form>
  );
}
