'use client';

import { useState } from 'react';
import type { OddsBucket } from '@/lib/stats/performance';
import {
  formatGelSigned,
  formatPercentBps,
  formatPercentBpsSigned,
} from '@/lib/format';

/**
 * How this author performs per odds range: how many decided tips landed in
 * each band, and what they returned.
 *
 * The bars are gone. They encoded one number - volume - that the table states
 * exactly, in a picture whose height was meaningless without reading the axis
 * anyway, and on a phone they cost a third of the panel to say less than the
 * row beneath them. Numbers only now.
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

  const roiBps = (bucket: OddsBucket) =>
    bucket.stakedUnitsCenti > 0
      ? Math.round((bucket.profitUnitsCenti * 10_000) / bucket.stakedUnitsCenti)
      : null;

  return (
    <div>
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
