import Link from 'next/link';
import { Check } from 'lucide-react';

/**
 * The feed's sort bar: tick chips, plain links (no-JS friendly, shareable).
 *
 * Two kinds of chip:
 *  - directional (კოეფიციენტი, ფასი): tap cycles მაღალი → დაბალი → off,
 *    with the active direction written on the chip;
 *  - plain (სიზუსტე, მალე იწყება): on/off, one obvious direction.
 * Ticks combine, stacking in display order.
 */

export type TickDirection = 'high' | 'low';

export type TickState = {
  odds?: TickDirection;
  acc?: boolean;
  /** Paid feed only. */
  price?: TickDirection;
  soon?: boolean;
};

function buildHref(basePath: string, state: TickState): string {
  const query = new URLSearchParams();
  if (state.odds) query.set('odds', state.odds);
  if (state.acc) query.set('acc', '1');
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

const DIRECTION_KA: Record<TickDirection, string> = {
  high: '↓ მაღალი',
  low: '↑ დაბალი',
};

function Tick({
  href,
  on,
  title,
  children,
}: {
  href: string;
  on: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // The tick changes the list, not the reader's place on the page.
      scroll={false}
      aria-pressed={on}
      title={title}
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
        title="კოეფიციენტით: მაღალი → დაბალი → გამორთვა"
      >
        კოეფიციენტი
        {state.odds ? (
          <span className="text-xs font-medium">{DIRECTION_KA[state.odds]}</span>
        ) : null}
      </Tick>

      <Tick
        href={buildHref(basePath, { ...state, acc: !state.acc })}
        on={state.acc === true}
        title="მაღალი სიზუსტე ჯერ"
      >
        სიზუსტე
      </Tick>

      {showPrice ? (
        <Tick
          href={buildHref(basePath, { ...state, price: nextDirection(state.price) })}
          on={state.price !== undefined}
          title="ფასით: მაღალი → დაბალი → გამორთვა"
        >
          ფასი
          {state.price ? (
            <span className="text-xs font-medium">{DIRECTION_KA[state.price]}</span>
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
