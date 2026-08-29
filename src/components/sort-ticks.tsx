import Link from 'next/link';
import { Check } from 'lucide-react';
import type { TickDirection } from '@/lib/queries/tickets';

/**
 * The feed's sort bar: three tick chips instead of a menu.
 *
 * Every chip is a link, so the bar is plain navigation - it works without
 * JavaScript and every combination has a URL that can be shared. Ticks
 * combine rather than replace each other; the two directional chips cycle
 * მაღალი → დაბალი → off on successive clicks, and with nothing ticked the
 * feed falls back to "მალე იწყება".
 */

export type TickState = {
  odds?: TickDirection;
  acc?: TickDirection;
  /** Paid feed only. */
  price?: TickDirection;
  soon?: boolean;
};

function buildHref(basePath: string, state: TickState): string {
  const query = new URLSearchParams();
  if (state.odds) query.set('odds', state.odds);
  if (state.acc) query.set('acc', state.acc);
  if (state.price) query.set('price', state.price);
  if (state.soon) query.set('soon', '1');
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function nextDirection(current: TickDirection | undefined): TickDirection | undefined {
  if (current === undefined) return 'high';
  if (current === 'high') return 'low';
  return undefined;
}

function Tick({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // The tick changes the list, not the reader's place on the page: a
      // scroll-to-top on every click is what made the bar feel broken.
      scroll={false}
      aria-pressed={on}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${
        on
          ? 'border-accent text-accent'
          : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
      }`}
    >
      <span
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border ${
          on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
        }`}
        aria-hidden="true"
      >
        {on ? <Check className="size-3" strokeWidth={3.5} /> : null}
      </span>
      {children}
    </Link>
  );
}

const DIRECTION_KA: Record<TickDirection, string> = {
  high: 'მაღალი',
  low: 'დაბალი',
};

export function SortTicks({
  basePath,
  state,
  showPrice = false,
}: {
  basePath: string;
  state: TickState;
  /** The paid feed adds a ფასი tick; the free feed has nothing priced. */
  showPrice?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="დალაგება">
      <Tick
        href={buildHref(basePath, { ...state, odds: nextDirection(state.odds) })}
        on={state.odds !== undefined}
      >
        კოეფიციენტი
        {state.odds ? (
          <span className="text-xs opacity-80">
            {DIRECTION_KA[state.odds]} {state.odds === 'high' ? '↓' : '↑'}
          </span>
        ) : null}
      </Tick>

      <Tick
        href={buildHref(basePath, { ...state, acc: nextDirection(state.acc) })}
        on={state.acc !== undefined}
      >
        სიზუსტე
        {state.acc ? (
          <span className="text-xs opacity-80">
            {DIRECTION_KA[state.acc]} {state.acc === 'high' ? '↓' : '↑'}
          </span>
        ) : null}
      </Tick>

      {showPrice ? (
        <Tick
          href={buildHref(basePath, { ...state, price: nextDirection(state.price) })}
          on={state.price !== undefined}
        >
          ფასი
          {state.price ? (
            <span className="text-xs opacity-80">
              {DIRECTION_KA[state.price]} {state.price === 'high' ? '↓' : '↑'}
            </span>
          ) : null}
        </Tick>
      ) : null}

      <Tick
        href={buildHref(basePath, { ...state, soon: !state.soon })}
        on={state.soon === true}
      >
        მალე იწყება
      </Tick>
    </div>
  );
}
