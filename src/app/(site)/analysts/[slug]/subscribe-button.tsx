'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { PlanCard, type PlanView } from '@/components/plan-card';

export type SubscribePlan = PlanView & {
  currentStatus?: 'ACTIVE' | 'PENDING';
};

/**
 * The subscribe control in the profile header.
 *
 * One button, top right, on every tab: it opens the plan in a dialog rather
 * than sending the reader down the page to find it. The dialog holds the
 * same PlanCard the checkout has always used, so the price, the author's
 * monthly minimum, the renewal terms and the refund link are all in front
 * of the reader before a card is charged.
 *
 * `openOnMount` is set by the page when it was reached through a subscribe
 * link (?subscribe=1): the reader pressed "გამოწერა" somewhere else on the
 * site and should not have to press it twice.
 */
export function SubscribeButton({
  label,
  plans,
  isAuthenticated,
  monthlyMinimum,
  owned,
  openOnMount = false,
}: {
  label: string;
  plans: SubscribePlan[];
  isAuthenticated: boolean;
  monthlyMinimum: number | null;
  /** The reader already holds one of these plans. */
  owned: boolean;
  openOnMount?: boolean;
}) {
  // Opens at once when the page was reached through a subscribe link, unless
  // there is nothing left to buy.
  const [open, setOpen] = useState(openOnMount && !owned);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          owned
            ? 'inline-flex min-h-11 items-center rounded-control border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent'
            : 'inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-sm font-semibold text-on-ink transition-colors hover:bg-accent'
        }
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="გამოწერა">
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={plans.length === 1 || plan.tier === 'PREMIUM'}
              isAuthenticated={isAuthenticated}
              currentStatus={plan.currentStatus}
              monthlyMinimum={monthlyMinimum}
            />
          ))}
        </div>
      </Modal>
    </>
  );
}
