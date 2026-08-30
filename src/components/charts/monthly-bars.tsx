'use client';

import { useState } from 'react';
import type { MonthlyBucket } from '@/lib/stats/performance';
import { formatGelSigned, formatMonthKa } from '@/lib/format';

/**
 * Month-by-month profit in units, drawn from a zero baseline so losing months
 * are as visible as winning ones. Showing only the good months would defeat
 * the point of the page.
 *
 * Interactive in the plainest way that works with a thumb: each column is a
 * real button, and the selected month's full figures print in a caption line
 * under the chart. Hover alone would leave phones with nothing.
 */
export function MonthlyBars({ buckets }: { buckets: MonthlyBucket[] }) {
  const recent = buckets.slice(-12);
  const [active, setActive] = useState<number | null>(
    recent.length > 0 ? recent.length - 1 : null,
  );

  if (buckets.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-muted">
        თვიური სტატისტიკა ჯერ არ არის.
      </div>
    );
  }

  const magnitude = Math.max(
    ...recent.map((bucket) => Math.abs(bucket.profitUnitsCenti)),
    100,
  );
  const selected = active !== null ? recent[active] : undefined;

  return (
    <div>
      <div className="flex h-[160px] items-stretch gap-1.5">
        {recent.map((bucket, index) => {
          const positive = bucket.profitUnitsCenti >= 0;
          const share = Math.abs(bucket.profitUnitsCenti) / magnitude;
          // Always show a sliver so a zero month is still a visible column.
          const heightPct = Math.max(share * 50, 1.5);
          const isActive = index === active;

          return (
            <button
              key={bucket.month}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={isActive}
              title={`${formatMonthKa(bucket.month)}: ${formatGelSigned(bucket.profitUnitsCenti)} (${bucket.won}-${bucket.lost})`}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-sm transition-colors ${
                isActive ? 'bg-elevated' : 'hover:bg-elevated/60'
              }`}
            >
              {/* Upper half: winning months grow up from the midline. */}
              <span className="flex w-full flex-1 items-end justify-center">
                {positive ? (
                  <span
                    className={`w-full rounded-t-md ${isActive ? 'bg-win' : 'bg-win/70'}`}
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </span>
              <span className="h-px w-full bg-line-strong" />
              <span className="flex w-full flex-1 items-start justify-center">
                {!positive ? (
                  <span
                    className={`w-full rounded-b-md ${isActive ? 'bg-loss' : 'bg-loss/70'}`}
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* The month scale, under the columns it labels. */}
      <div className="mt-2 flex gap-1.5">
        {recent.map((bucket, index) => (
          <div
            key={bucket.month}
            className={`min-w-0 flex-1 truncate text-center text-xs ${
              index === active ? 'font-medium text-ink' : 'text-ink-faint'
            }`}
          >
            {formatMonthKa(bucket.month).split(' ')[0]}
          </div>
        ))}
      </div>

      {/* The selected month, in full words - the chart's readout. */}
      <p className="mt-3 border-t border-line pt-2.5 text-sm text-ink-muted" aria-live="polite">
        {selected ? (
          <>
            <span className="font-medium text-ink">
              {formatMonthKa(selected.month)}
            </span>
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
              {formatGelSigned(selected.profitUnitsCenti)}
            </span>
            {` · ${selected.won} მოგებული, ${selected.lost} წაგებული`}
          </>
        ) : (
          'აირჩიეთ თვე დეტალებისთვის.'
        )}
      </p>

      {/* The same data as text, for assistive technology and for verification. */}
      <table className="sr-only">
        <caption>თვიური შედეგები</caption>
        <thead>
          <tr>
            <th scope="col">თვე</th>
            <th scope="col">მოგებული</th>
            <th scope="col">წაგებული</th>
            <th scope="col">მოგება (₾)</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((bucket) => (
            <tr key={bucket.month}>
              <th scope="row">{formatMonthKa(bucket.month)}</th>
              <td>{bucket.won}</td>
              <td>{bucket.lost}</td>
              <td>{formatGelSigned(bucket.profitUnitsCenti)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
