'use client';

import { useActionState, useState } from 'react';
import {
  openSubscriptionTestAction,
  stopSubscriptionTestAction,
} from '@/actions/subscription-test';
import type { CancellationTest } from '@/lib/subscriptions/live-test';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';

/**
 * Starting the test, and stopping one of its two calendars.
 *
 * The pair survives a reload because the server reads the last run back out of
 * the audit trail: paying happens on the gateway's own page, in another tab,
 * and coming back to a form that had forgotten the order ids would lose the
 * experiment halfway through.
 */
export function TestControls({ initial }: { initial: CancellationTest[] }) {
  const [openState, open, opening] = useActionState(
    openSubscriptionTestAction,
    null,
  );
  const [armed, setArmed] = useState(false);

  /*
   * Every run stays on the page, not only the newest. Each one holds live
   * calendars on a real card, and a stop button that scrolled away with the
   * previous run is a calendar nobody can stop.
   */
  const tests = openState?.ok
    ? [
        openState.data,
        ...initial.filter(
          (test) => test.calendars[0]?.orderId !== openState.data.calendars[0]?.orderId,
        ),
      ]
    : initial;

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">ახალი ტესტი</h2>

        {openState && !openState.ok ? (
          <Alert tone="error">{openState.error.message}</Alert>
        ) : null}

        <form action={open} className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="firstChargeInMinutes"
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              პირველი ჩამოჭრა (წუთში)
            </label>
            <input
              id="firstChargeInMinutes"
              name="firstChargeInMinutes"
              type="number"
              min={15}
              max={1440}
              step={5}
              defaultValue={60}
              required
              className="tabular min-h-11 w-40 rounded-control border border-line bg-canvas px-3 text-sm text-ink"
            />
            <p className="mt-1 text-xs text-ink-faint">
              gateway-ის უმოკლესი ციკლი დღეა, მაგრამ პირველი ჩამოჭრა შეიძლება
              ერთ საათში იყოს — სწორედ ის პასუხობს კითხვას.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={armed}
              onChange={(event) => setArmed(event.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              ვადასტურებ: ეს ცოცხალ ბარათს ჭრის და ორ ნამდვილ გამოწერას ხსნის.
            </span>
          </label>

          <Button type="submit" size="sm" disabled={!armed || opening}>
            {opening ? 'იხსნება…' : 'ტესტის დაწყება'}
          </Button>
        </form>
      </section>

      {tests.map((test, index) => (
        <section key={test.calendars[0]?.orderId ?? index} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              {index === 0 ? 'მიმდინარე ტესტი' : 'წინა ტესტი'}
            </h2>
            <span className="text-xs text-ink-muted">
              პირველი ჩამოჭრა:{' '}
              <span className="tabular text-ink">{test.firstChargeAt}</span>
            </span>
          </div>

          {test.calendars.map((calendar) => (
            <Calendar
              key={calendar.orderId}
              role={calendar.role}
              orderId={calendar.orderId}
              url={calendar.url}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function Calendar({
  role,
  orderId,
  url,
}: {
  role: 'a' | 'b';
  orderId: string;
  url: string;
}) {
  const [state, stop, stopping] = useActionState(
    stopSubscriptionTestAction,
    null,
  );
  const isControl = role === 'b';

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">
          {role.toUpperCase()} —{' '}
          {isControl ? 'საკონტროლო, არ ჩერდება' : 'ამას ვაჩერებთ'}
        </h3>
        <span className="tabular text-xs text-ink-faint">{orderId}</span>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
      >
        გადახდის გვერდის გახსნა
      </a>

      {state?.ok ? (
        <Alert tone={state.data.accepted ? 'success' : 'error'}>
          {state.data.accepted
            ? 'gateway-მა მიიღო: კალენდარი გაჩერებულია.'
            : `gateway-მა უარი თქვა: ${state.data.detail}. გაითვალისწინე, უარი იმასაც შეიძლება ნიშნავდეს, რომ გასაჩერებელი კალენდარი არ არსებობს.`}
        </Alert>
      ) : null}
      {state && !state.ok ? (
        <Alert tone="error">{state.error.message}</Alert>
      ) : null}

      <form action={stop} className="mt-3">
        <input type="hidden" name="orderId" value={orderId} />
        <Button
          type="submit"
          size="sm"
          variant={isControl ? 'ghost' : 'primary'}
          disabled={stopping}
        >
          {stopping ? 'ჩერდება…' : 'კალენდარის გაჩერება'}
        </Button>
      </form>

      {isControl ? (
        <p className="mt-2 text-xs text-ink-faint">
          ამას ტესტის დასრულებამდე არ ეხები. ბოლოს კი აუცილებლად გააჩერე.
        </p>
      ) : null}
    </div>
  );
}
