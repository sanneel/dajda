'use client';

import { useState } from 'react';
import type { OddsBucket } from '@/lib/stats/performance';
import {
  formatGelSigned,
  formatPercentBps,
  formatPercentBpsSigned,
} from '@/lib/format';

/**
 * "Top selected odds", per the reference: bars count the TIPS in each odds
 * range - where this author actually lives on the odds ladder - and the
 * table under them carries the judgement figures per range: win rate,
 * profit and ROI. Volume in the picture, performance in the numbers;
 * putting profit in the bars made rare long-shot wins dwarf the record.
 *
 * Tapping a bar (or a row) highlights its pair, so the two read as one
 * instrument on a phone as well.
 */
export function OddsBucketsChart({ buckets }: { buckets: OddsBucket[] }) {
  const [active, setActive] = useState<number | null>(null);

  const anyDecided = buckets.some((bucket) => bucket.decided > 0);
  if (!anyDecided) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-muted">
        დათვლილი ბილეთი ჯერ არ არის.
      </div>
    );
  }

  const maxCount = Math.max(...buckets.map((bucket) => bucket.decided), 1);

  const roiBps = (bucket: OddsBucket) =>
    bucket.stakedUnitsCenti > 0
      ? Math.round((bucket.profitUnitsCenti * 10_000) / bucket.stakedUnitsCenti)
      : null;

  return (
    <div>
      {/* Bars: how many decided tips landed in each range. */}
      <div className="flex h-[130px] items-end gap-3">
        {buckets.map((bucket, index) => {
          const isActive = index === active;
          const share = bucket.decided / maxCount;
          const heightPct = bucket.decided === 0 ? 1.5 : Math.max(share * 100, 4);

          return (
            <button
              key={bucket.label}
              type="button"
              onClick={() => setActive(isActive ? null : index)}
              aria-pressed={isActive}
              title={`კუში ${bucket.label}: ${bucket.decided} ბილეთი`}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1 rounded-sm pt-1 transition-colors ${
                isActive ? 'bg-elevated' : 'hover:bg-elevated/60'
              }`}
            >
              <span className="tabular text-xs text-ink-muted">
                {bucket.decided}
              </span>
              <span
                className={`w-full rounded-t-md ${isActive ? 'bg-accent' : 'bg-accent/60'}`}
                style={{ height: `${heightPct}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* The odds scale, under the columns it labels. */}
      <div className="flex gap-3 border-t border-line-strong pt-1.5">
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

      {/* The same ranges as numbers: the reference's table, in units. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <caption className="sr-only">შედეგი კუშის მიხედვით</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-1.5 pr-2 font-medium text-ink-muted">
                კუში
              </th>
              <th scope="col" className="tabular py-1.5 pr-2 text-right font-medium text-ink-muted">
                ბილეთი
              </th>
              <th scope="col" className="tabular py-1.5 pr-2 text-right font-medium text-ink-muted">
                მოგების %
              </th>
              <th scope="col" className="tabular py-1.5 pr-2 text-right font-medium text-ink-muted">
                მოგება
              </th>
              <th scope="col" className="tabular py-1.5 text-right font-medium text-ink-muted">
                ROI
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket, index) => {
              const roi = roiBps(bucket);
              return (
                <tr
                  key={bucket.label}
                  onClick={() => setActive(index === active ? null : index)}
                  className={`cursor-pointer border-b border-line last:border-0 ${
                    index === active ? 'bg-elevated' : 'hover:bg-elevated/60'
                  }`}
                >
                  <th scope="row" className="tabular py-1.5 pr-2 text-left font-medium text-ink">
                    {bucket.label}
                  </th>
                  <td className="tabular py-1.5 pr-2 text-right text-ink-muted">
                    {bucket.decided}
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right text-ink-muted">
                    {bucket.decided > 0
                      ? formatPercentBps(
                          Math.round((bucket.won * 10_000) / bucket.decided),
                        )
                      : '·'}
                  </td>
                  <td
                    className={`tabular py-1.5 pr-2 text-right font-medium ${
                      bucket.profitUnitsCenti > 0
                        ? 'text-win'
                        : bucket.profitUnitsCenti < 0
                          ? 'text-loss'
                          : 'text-ink-muted'
                    }`}
                  >
                    {bucket.decided > 0
                      ? formatGelSigned(bucket.profitUnitsCenti)
                      : '·'}
                  </td>
                  <td
                    className={`tabular py-1.5 text-right ${
                      roi === null
                        ? 'text-ink-muted'
                        : roi > 0
                          ? 'text-win'
                          : roi < 0
                            ? 'text-loss'
                            : 'text-ink-muted'
                    }`}
                  >
                    {roi === null ? '·' : formatPercentBpsSigned(roi)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
