'use client';

import { useActionState } from 'react';
import { Check } from 'lucide-react';
import type { PlanTier, BillingPeriod } from '@/generated/prisma/enums';
import { BILLING_PERIOD_KA, PLAN_TIER_KA } from '@/lib/labels';
import { formatMoney } from '@/lib/format';
import { startCheckoutAction } from '@/actions/subscriptions';
import { Alert } from './ui/feedback';
import { Badge } from './ui/badge';

export type PlanView = {
  id: string;
  tier: PlanTier;
  nameKa: string;
  descriptionKa: string;
  featuresKa: string[];
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
};

/**
 * Subscription plan.
 *
 * Wording is deliberately neutral - access, timing and depth of analysis.
 * Nothing here promises profit, and there is no "risk-free" or "sure win"
 * language anywhere in the plan copy or the seeded feature lists.
 */
export function PlanCard({
  plan,
  featured = false,
  isAuthenticated,
  currentStatus,
}: {
  plan: PlanView;
  featured?: boolean;
  isAuthenticated: boolean;
  /** Set when the viewer already holds this plan. */
  currentStatus?: 'ACTIVE' | 'PENDING';
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);

  const isFree = plan.priceMinor === 0;
  const owned = currentStatus === 'ACTIVE';

  return (
    <div
      className={`flex flex-col rounded-md border bg-surface ${
        featured ? 'border-accent/50' : 'border-line'
      }`}
    >
      <div className="border-b border-line p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            {plan.nameKa}
          </h3>
          <Badge tone={featured ? 'accent' : 'neutral'}>
            {PLAN_TIER_KA[plan.tier]}
          </Badge>
        </div>

        <p className="mt-1.5 text-sm text-ink-muted">{plan.descriptionKa}</p>

        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="tabular text-3xl font-bold tracking-tight text-ink">
            {isFree ? 'უფასო' : formatMoney(plan.priceMinor, plan.currency)}
          </span>
          {!isFree ? (
            <span className="text-sm text-ink-muted">
              / {BILLING_PERIOD_KA[plan.billingPeriod]}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex-1 p-5">
        <ul className="space-y-2.5">
          {plan.featuresKa.map((feature) => (
            <li key={feature} className="flex gap-2.5 text-sm text-ink-muted">
              <Check
                className="mt-0.5 size-4 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line p-5">
        {owned ? (
          <p className="flex min-h-11 items-center justify-center rounded-md border border-accent/40 bg-accent/10 text-sm font-medium text-accent">
            აქტიური გეგმა
          </p>
        ) : currentStatus === 'PENDING' ? (
          <p className="flex min-h-11 items-center justify-center rounded-md border border-line text-sm text-ink-muted">
            გადახდის დადასტურების მოლოდინში
          </p>
        ) : isAuthenticated ? (
          <form action={action}>
            <input type="hidden" name="planId" value={plan.id} />
            <button
              type="submit"
              disabled={pending}
              className={`min-h-11 w-full rounded-md px-4 text-sm font-semibold transition-colors disabled:opacity-45 ${
                featured
                  ? 'bg-accent text-accent-ink hover:bg-accent-dim'
                  : 'border border-line bg-elevated text-ink hover:border-line-strong'
              }`}
            >
              {pending
                ? 'მუშავდება…'
                : isFree
                  ? 'გააქტიურება'
                  : 'გამოწერა'}
            </button>
          </form>
        ) : (
          <a
            href="/login"
            className="flex min-h-11 w-full items-center justify-center rounded-md border border-line bg-elevated px-4 text-sm font-semibold text-ink transition-colors hover:border-line-strong"
          >
            შესვლა გამოსაწერად
          </a>
        )}

        {state && !state.ok ? (
          <div className="mt-3">
            <Alert tone="error">{state.error.message}</Alert>
          </div>
        ) : null}

        {!isFree ? (
          /*
           * The recurring terms sit on the button, not only in the terms
           * document: the amount, how often it is taken, and how to stop it.
           * This is the last screen before a card is charged, so it is where
           * a person decides - and a payment provider checks for exactly this
           * disclosure at exactly this point.
           */
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            ავტომატური განახლება:{' '}
            <span className="tabular text-ink-muted">
              {formatMoney(plan.priceMinor, plan.currency)}
            </span>{' '}
            ყოველ {BILLING_PERIOD_KA[plan.billingPeriod].replace('ში', 'ს')},
            სანამ არ გააუქმებთ. გაუქმება შესაძლებელია ნებისმიერ დროს
            პროფილიდან, წვდომა რჩება გადახდილი პერიოდის ბოლომდე.
          </p>
        ) : null}
      </div>
    </div>
  );
}
