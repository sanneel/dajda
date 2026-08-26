'use client';

import { startTransition, useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { telegramAuthAction } from '@/actions/telegram';
import { Checkbox } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';

/**
 * Reads Telegram's `#tgAuthResult=<base64>` fragment and plays it to the
 * server action.
 *
 * The first pass fires by itself from an effect - the user already acted by
 * approving on Telegram, and an extra "continue" click here would be
 * ceremony. A missing or garbled fragment is not special-cased on the client:
 * the empty payload goes to the server like any other and comes back as the
 * same error the user would get for a forged one.
 *
 * Two passes for a new account: the first submit returns `needsConfirm`,
 * because the 18+ and terms certifications are taken at registration for
 * every account and Telegram cannot supply them. The SAME signed payload is
 * resubmitted with the boxes ticked; the server verifies it again both times.
 *
 * The fragment is scrubbed from the address bar immediately so the signed
 * payload does not sit in the URL for the lifetime of the tab.
 */
export function TelegramCallback() {
  const [state, action, pending] = useActionState(telegramAuthAction, null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const match = window.location.hash.match(
      /tgAuthResult=([A-Za-z0-9_+/=-]+)/,
    );
    window.history.replaceState(null, '', window.location.pathname);

    const first = new FormData();
    first.set('payload', match?.[1] ?? '');
    startTransition(() => action(first));
  }, [action]);

  const needsConfirm = state?.ok && state.data.needsConfirm;
  const error = state && !state.ok ? state.error.message : null;

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Link href="/login" className="text-sm text-accent hover:underline">
          შესვლის გვერდზე დაბრუნება
        </Link>
      </div>
    );
  }

  if (!needsConfirm) {
    return (
      <p className="text-sm text-ink-muted" role="status">
        მოწმდება…
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* The signed payload, echoed back by the server for the second pass. */}
      <input type="hidden" name="payload" value={state?.ok ? state.data.payload ?? '' : ''} />

      <p className="text-sm text-ink-muted">
        Telegram დადასტურდა. ანგარიშის შესაქმნელად საჭიროა კიდევ ორი რამ:
      </p>

      <Checkbox
        id="ageConfirmed"
        name="ageConfirmed"
        required
        label="ვადასტურებ, რომ 18 წლის ვარ."
      />
      <Checkbox
        id="acceptTerms"
        name="acceptTerms"
        required
        label={
          <>
            ვეთანხმები{' '}
            <Link href="/legal" className="text-accent hover:underline">
              წესებსა და პირობებს
            </Link>
            .
          </>
        }
      />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'იქმნება…' : 'ანგარიშის შექმნა'}
      </Button>
    </form>
  );
}
