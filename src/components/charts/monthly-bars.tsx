import type { MonthlyBucket } from '@/lib/stats/performance';
import { formatMonthKa, formatUnitsSigned } from '@/lib/format';

/**
 * Month-by-month profit in units, drawn from a zero baseline so losing months
 * are as visible as winning ones. Showing only the good months would defeat
 * the point of the page.
 */
export function MonthlyBars({ buckets }: { buckets: MonthlyBucket[] }) {
  if (buckets.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-muted">
        თვიური სტატისტიკა ჯერ არ არის.
      </div>
    );
  }

  const recent = buckets.slice(-12);
  const magnitude = Math.max(
    ...recent.map((bucket) => Math.abs(bucket.profitUnitsCenti)),
    100,
  );

  return (
    <div>
      <div className="flex h-[160px] items-stretch gap-1.5">
        {recent.map((bucket) => {
          const positive = bucket.profitUnitsCenti >= 0;
          const share = Math.abs(bucket.profitUnitsCenti) / magnitude;
          // Always show a sliver so a zero month is still a visible column.
          const heightPct = Math.max(share * 50, 1.5);

          return (
            <div
              key={bucket.month}
              className="flex min-w-0 flex-1 flex-col items-center justify-center"
              title={`${formatMonthKa(bucket.month)}: ${formatUnitsSigned(bucket.profitUnitsCenti)} ერთეული (${bucket.won}-${bucket.lost})`}
            >
              {/* Upper half: winning months grow up from the midline. */}
              <div className="flex w-full flex-1 items-end justify-center">
                {positive ? (
                  <div
                    className="w-full rounded-t-sm bg-win/80"
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </div>
              <div className="h-px w-full bg-line-strong" />
              <div className="flex w-full flex-1 items-start justify-center">
                {!positive ? (
                  <div
                    className="w-full rounded-b-sm bg-loss/80"
                    style={{ height: `${heightPct * 2}%` }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {recent.map((bucket) => (
          <div
            key={bucket.month}
            className="min-w-0 flex-1 truncate text-center text-xs text-ink-faint"
          >
            {formatMonthKa(bucket.month).split(' ')[0]}
          </div>
        ))}
      </div>

      {/* The same data as text, for assistive technology and for verification. */}
      <table className="sr-only">
        <caption>თვიური შედეგები</caption>
        <thead>
          <tr>
            <th scope="col">თვე</th>
            <th scope="col">მოგებული</th>
            <th scope="col">წაგებული</th>
            <th scope="col">ერთეული</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((bucket) => (
            <tr key={bucket.month}>
              <th scope="row">{formatMonthKa(bucket.month)}</th>
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
