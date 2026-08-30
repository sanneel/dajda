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
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors ${
        on
          ? 'border-accent bg-accent/10 font-medium text-accent'
          : 'border-line bg-surface text-ink-muted hover:border-ink-faint hover:text-ink'
      }`}
    >
      {/*
       * The checkbox only appears once ticked. Three empty boxes sitting in a
       * row read as a form waiting to be filled in; the point of this bar is
       * that nothing is required, so an unticked chip is just a word.
       */}
      {on ? (
        <Check className="-ml-0.5 size-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
      ) : null}
      {children}
    </Link>
  );
}

export function SortTicks({
  basePath,
  state,
  showPrice = false,
  total,
}: {
  basePath: string;
  state: TickState;
  /** The paid feed adds a ფასი tick; the free feed has nothing priced. */
  showPrice?: boolean;
  /** Row count, printed above the chips rather than wrapping among them. */
  total?: number;
}) {
  const active =
    (state.odds ? 1 : 0) +
    (state.acc ? 1 : 0) +
    (state.price ? 1 : 0) +
    (state.soon ? 1 : 0);

  return (
    <div>
      {/*
       * Caption line first, chips under it. Letting the count wrap in among
       * the chips is what made this bar look accidental on a phone: it landed
       * on its own line, right-aligned under a ragged second row of chips.
       */}
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="rule-label text-ink-faint">დალაგება</span>
        <span className="tabular text-xs text-ink-faint">
          {active > 0 ? (
            <Link
              href={basePath}
              scroll={false}
              className="mr-3 font-medium text-accent hover:underline"
            >
              გასუფთავება
            </Link>
          ) : null}
          {total !== undefined ? `${total} პროგნოზი` : null}
        </span>
      </div>

      {/*
       * One row that scrolls sideways on a narrow screen instead of wrapping.
       * A fixed number of short chips reads as a control; the same chips
       * reflowing into two ragged rows reads as a paragraph of buttons.
       */}
      <div
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="დალაგება"
      >
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
    </div>
  );
}
