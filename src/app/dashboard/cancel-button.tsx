'use client';

import { useActionState } from 'react';
import { cancelSubscriptionAction } from '@/actions/subscriptions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

export function CancelSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [state, action, pending] = useActionState(
    cancelSubscriptionAction,
    null,
  );

  if (state?.ok) {
    return (
      <Alert tone="success">
        გამოწერა გაუქმდება მიმდინარე პერიოდის ბოლოს.
      </Alert>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />

      {state && !state.ok ? (
        <div className="mb-2">
          <Alert tone="error">{state.error.message}</Alert>
        </div>
      ) : null}

      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? 'მუშავდება…' : 'გამოწერის გაუქმება'}
      </Button>
    </form>
  );
}
