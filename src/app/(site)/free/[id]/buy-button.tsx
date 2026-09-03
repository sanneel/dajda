'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { purchaseTicketAction } from '@/actions/purchases';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/format';
import { PaymentMarks } from '@/components/payment-marks';

/**
 * The one-off purchase button on a locked paid ticket.
 *
 * A balance that covers the price completes right here (the page revalidates
 * open); otherwise the action redirects to the provider's checkout, and
 * access appears only when the webhook confirms the payment.
 */
export function BuyTicketButton({
  predictionId,
  priceMinor,
}: {
  predictionId: string;
  priceMinor: number;
}) {
  const [state, action, pending] = useActionState(purchaseTicketAction, null);
  const router = useRouter();

  // A balance purchase completes right here; refresh so the pick appears.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok) {
    return (
      <Alert tone="success" title="შეძენილია">
        ბილეთი გაიხსნა - წამში გამოჩნდება.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="predictionId" value={predictionId} />
      {state && !state.ok ? (
        <Alert tone="error">{state.error.message ?? 'ვერ შესრულდა.'}</Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending
          ? 'მუშავდება…'
          : `ყიდვა · ${formatMoney(priceMinor, 'GEL')}`}
      </Button>
      <p className="flex items-center gap-2 text-xs text-ink-faint">
        <span>ბარათით ან ბალანსიდან:</span>
        <PaymentMarks />
      </p>
    </form>
  );
}
