'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import type { PlanTier, BillingPeriod } from '@/generated/prisma/enums';
import { BILLING_PERIOD_KA } from '@/lib/labels';
import { formatMoney } from '@/lib/format';
import {
  chargeScheduleKa,
  nextChargeDate,
} from '@/lib/subscriptions/charge-schedule';
import { startCheckoutAction } from '@/actions/subscriptions';
import { Alert } from './ui/feedback';
import { PaymentMarks } from './payment-marks';

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
  monthlyMinimum,
  recurring,
}: {
  plan: PlanView;
  featured?: boolean;
  isAuthenticated: boolean;
  /**
   * Whether buying opens a renewal calendar (SUBSCRIPTION_RECURRING). Passed
   * in rather than read here: this is a client component, and the flag lives
   * in the server environment.
   */
  recurring: boolean;
  /**
   * The author's declared monthly floor (terms 6.4). Stated on the card
   * because the rule requires it to be visible BEFORE the subscription is
   * bought, and this card is where that decision is made.
   */
  monthlyMinimum?: number | null;
  /** Set when the viewer already holds this plan. */
  currentStatus?: 'ACTIVE' | 'PENDING';
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  const router = useRouter();

  // A balance (or free-plan) activation completes without the gateway;
  // refresh so the page reflects the new subscription at once.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const isFree = plan.priceMinor === 0;
  const owned = currentStatus === 'ACTIVE' || Boolean(state?.ok);

  return (
    <div
      className={`flex flex-col rounded-md border bg-surface ${
        featured ? 'border-accent/50' : 'border-line'
      }`}
    >
      <div className="border-b border-line p-5">
        {/* No tier badge: there are no tiers. An author sells access to
            themselves, at one price, and stamping "გამოწერა" next to a card
            already named "… · გამოწერა" only repeated the word. */}
        <h3 className="text-lg font-semibold tracking-tight text-ink">
          {plan.nameKa}
        </h3>

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

        {monthlyMinimum ? (
          <p className="mt-3 rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink-muted">
            ავტორი იღებს ვალდებულებას{' '}
            <span className="tabular font-semibold text-ink">
              თვეში მინიმუმ {monthlyMinimum} პროგნოზზე
            </span>
            .
          </p>
        ) : null}
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

        {state?.ok ? (
          <div className="mb-3">
            <Alert tone="success" title="გამოწერა გააქტიურდა">
              წვდომა უკვე გახსნილია.
            </Alert>
          </div>
        ) : null}
        {state && !state.ok ? (
          <div className="mt-3">
            <Alert tone="error">{state.error.message}</Alert>
          </div>
        ) : null}

        {!isFree ? (
          /*
           * The terms sit on the button, not only in the terms document: what
           * the payment buys, and what happens to the card afterwards. This is
           * the last screen before a card is charged, so it is where a person
           * decides, and a payment provider checks for exactly this disclosure
           * here. When the charge repeats, the amount, how often, and how to
           * stop it all have to be on this screen - saying it only in the
           * terms is what makes a recurring charge a surprise.
           */
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            {recurring ? (
              <>
                დღეს:{' '}
                <span className="tabular text-ink-muted">
                  {formatMoney(plan.priceMinor, plan.currency)}
                </span>
                . გამოწერა ავტომატურად განახლდება:{' '}
                {/* Computed from today, like the checkout's calendar. The
                    server and the browser can straddle midnight UTC, and
                    then the date differs by a day; the browser's is the
                    one the buyer is about to act on. */}
                <span className="text-ink-muted" suppressHydrationWarning>
                  {chargeScheduleKa({
                    amountMinor: plan.priceMinor,
                    currency: plan.currency,
                    period: plan.billingPeriod,
                    nextCharge: nextChargeDate(new Date(), plan.billingPeriod),
                  })}
                </span>
                , სანამ არ გააუქმებთ. ყოველ ჩამოჭრის შემდეგ ელფოსტაზე
                მიიღებთ შემდეგი ჩამოჭრის თარიღსა და თანხას. გაუქმება
                ნებისმიერ დროს შეგიძლიათ პროფილის გვერდიდან; წვდომა გადახდილი
                პერიოდის ბოლომდე რჩება.
              </>
            ) : (
              <>
                ერთჯერადი გადახდა:{' '}
                <span className="tabular text-ink-muted">
                  {formatMoney(plan.priceMinor, plan.currency)}
                </span>{' '}
                ერთი თვის წვდომისთვის. ავტომატურად არ განახლდება: ბარათიდან
                თანხა ხელახლა არ ჩამოიჭრება, და გასაგრძელებლად ვადის ბოლოს
                გადაიხდით ხელახლა.
              </>
            )}
          </p>
        ) : null}
        {!isFree ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
            <span>ბარათით:</span>
            <PaymentMarks withWallets />
          </p>
        ) : null}
      </div>
    </div>
  );
}
