'use client';

import { useActionState } from 'react';
import { purchaseTicketAction } from '@/actions/purchases';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { formatMoney } from '@/lib/format';

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
    </form>
  );
}
