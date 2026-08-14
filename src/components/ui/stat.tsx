import type { ReactNode } from 'react';

type StatTone = 'default' | 'positive' | 'negative';

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-ink',
  positive: 'text-win',
  negative: 'text-loss',
};

/**
 * Compact metric. The label sits under the value so a row of stats scans as a
 * line of numbers first, which is how a results table is actually read.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  size?: 'sm' | 'md' | 'lg';
}) {
  const valueSize =
    size === 'lg'
      ? 'text-2xl sm:text-3xl'
      : size === 'sm'
        ? 'text-base'
        : 'text-xl';

  return (
    <div className="min-w-0">
      <div
        className={`tabular font-semibold tracking-tight ${valueSize} ${VALUE_TONE[tone]}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-ink-muted">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-faint">{hint}</div> : null}
    </div>
  );
}

/** Divided row of stats; wraps to two columns on narrow screens. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-line [&>*]:sm:pl-4 [&>*:first-child]:sm:pl-0">
      {children}
    </div>
  );
}

/**
 * Win/loss/pending record shown as a single unit, so a hit rate is never
 * displayed without the sample it came from.
 */
export function RecordBar({
  won,
  lost,
  pending,
}: {
  won: number;
  lost: number;
  pending: number;
}) {
  const decided = won + lost;
  const total = decided + pending;
  const winPct = decided === 0 ? 0 : (won / decided) * 100;

  return (
    <div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-elevated"
        role="img"
        aria-label={`მოგებული ${won}, წაგებული ${lost}, მოლოდინში ${pending}`}
      >
        <div className="bg-win" style={{ width: `${winPct}%` }} />
        <div className="bg-loss" style={{ width: `${100 - winPct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
        <span className="tabular">
          <span className="text-win">{won}</span> მოგებული
        </span>
        <span className="tabular">
          <span className="text-loss">{lost}</span> წაგებული
        </span>
        <span className="tabular">{pending} მოლოდინში</span>
        <span className="tabular text-ink-faint">სულ {total}</span>
      </div>
    </div>
  );
}
