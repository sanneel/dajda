import Link from 'next/link';
import { Check } from 'lucide-react';

/**
 * The feed's sort bar: plain tick chips instead of a menu.
 *
 * Every chip is a link, so the bar is plain navigation - it works without
 * JavaScript and every combination has a URL that can be shared. Each tick
 * has exactly one direction, the end nobody asked to invert: highest odds,
 * highest accuracy, cheapest price. Ticks combine, stacking in display
 * order; with nothing ticked the feed falls back to "მალე იწყება".
 */

export type TickState = {
  odds?: boolean;
  acc?: boolean;
  /** Paid feed only. */
  price?: boolean;
  soon?: boolean;
};

function buildHref(basePath: string, state: TickState): string {
  const query = new URLSearchParams();
  if (state.odds) query.set('odds', '1');
  if (state.acc) query.set('acc', '1');
  if (state.price) query.set('price', '1');
  if (state.soon) query.set('soon', '1');
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

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
      // The tick changes the list, not the reader's place on the page: a
      // scroll-to-top on every click is what made the bar feel broken.
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
        href={buildHref(basePath, { ...state, odds: !state.odds })}
        on={state.odds === true}
        title="მაღალი კოეფიციენტი ჯერ"
      >
        კოეფიციენტი
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
          href={buildHref(basePath, { ...state, price: !state.price })}
          on={state.price === true}
          title="იაფი ჯერ"
        >
          ფასი
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
