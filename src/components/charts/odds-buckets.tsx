'use client';

import { useState } from 'react';
import type { OddsBucket } from '@/lib/stats/performance';
import { formatUnitsSigned } from '@/lib/format';

/**
 * Profit per odds range: what the author does with favourites versus long
 * shots. The same construction as MonthlyBars - columns from a zero baseline,
 * a range scale underneath, and a tap-to-read caption - so the two charts
 * read as one instrument.
 */
export function OddsBucketsChart({ buckets }: { buckets: OddsBucket[] }) {
  // An empty range stays visible at zero: "never bets 10+" is information.
  const played = buckets.filter(
    (bucket) => bucket.decided > 0 || bucket.profitUnitsCenti !== 0,
  );
  const [active, setActive] = useState<number | null>(null);

  if (played.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-muted">
        დათვლილი ფსონი ჯერ არ არის.
      </div>
    );
  }

  const magnitude = Math.max(
    ...buckets.map((bucket) => Math.abs(bucket.profitUnitsCenti)),
    100,
  );
  const selected = active !== null ? buckets[active] : undefined;

  return (
    <div>
      <div className="flex h-[160px] items-stretch gap-3">
        {buckets.map((bucket, index) => {
          const positive = bucket.profitUnitsCenti >= 0;
          const share = Math.abs(bucket.profitUnitsCenti) / magnitude;
          const heightPct = Math.max(share * 50, 1.5);
          const isActive = index === active;

          return (
            <button
              key={bucket.label}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={isActive}
              title={`კოეფ. ${bucket.label}: ${formatUnitsSigned(bucket.profitUnitsCenti)} ერთეული (${bucket.won}-${bucket.lost})`}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-sm transition-colors ${
                isActive ? 'bg-elevated' : 'hover:bg-elevated/60'
              }`}
            >
              <span className="flex w-full flex-1 items-end justify-center">
                {positive ? (
                  <span
                    className={`w-full rounded-t-sm ${isActive ? 'bg-win' : 'bg-win/70'}`}
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </span>
              <span className="h-px w-full bg-line-strong" />
              <span className="flex w-full flex-1 items-start justify-center">
                {!positive ? (
                  <span
                    className={`w-full rounded-b-sm ${isActive ? 'bg-loss' : 'bg-loss/70'}`}
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* The odds scale, under the columns it labels. */}
      <div className="mt-2 flex gap-3">
        {buckets.map((bucket, index) => (
          <div
            key={bucket.label}
            className={`tabular min-w-0 flex-1 truncate text-center text-xs ${
              index === active ? 'font-medium text-ink' : 'text-ink-faint'
            }`}
          >
            {bucket.label}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-line pt-2.5 text-sm text-ink-muted" aria-live="polite">
        {selected ? (
          <>
            <span className="font-medium text-ink">კოეფ. {selected.label}</span>
            {' · '}
            <span
              className={`tabular font-medium ${
                selected.profitUnitsCenti > 0
                  ? 'text-win'
                  : selected.profitUnitsCenti < 0
                    ? 'text-loss'
                    : 'text-ink-muted'
              }`}
            >
              {formatUnitsSigned(selected.profitUnitsCenti)} ერთ.
            </span>
            {` · ${selected.won} მოგებული, ${selected.lost} წაგებული`}
          </>
        ) : (
          'აირჩიეთ სვეტი დეტალებისთვის.'
        )}
      </p>

      <table className="sr-only">
        <caption>შედეგი კოეფიციენტის მიხედვით</caption>
        <thead>
          <tr>
            <th scope="col">კოეფიციენტი</th>
            <th scope="col">მოგებული</th>
            <th scope="col">წაგებული</th>
            <th scope="col">ერთეული</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.label}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.won}</td>
              <td>{bucket.lost}</td>
              <td>{formatUnitsSigned(bucket.profitUnitsCenti)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
