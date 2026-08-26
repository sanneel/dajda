import Link from 'next/link';
import type { AnalystListItem } from '@/lib/queries/analysts';
import {
  formatMoney,
  formatOdds,
  formatPercentBps,
  formatUnitsSigned,
} from '@/lib/format';
import { BILLING_PERIOD_KA } from '@/lib/labels';
import { DemoBadge } from './ui/badge';
import { Avatar } from './ui/avatar';

/**
 * One analyst, as a row inside the shared list container.
 *
 * Not a card. The reference draws these as ruled rows in a single panel, and
 * that is the right structure for the job: these exist to be compared down a
 * column, and giving each one its own border makes the reader's eye stop at
 * every boundary instead of running down the metrics.
 *
 * The row therefore draws no outer border and no background of its own. The
 * separator between rows belongs to the list, not to the row.
 */
export function AnalystRow({ analyst }: { analyst: AnalystListItem }) {
  const { allTime, cheapestPlan } = analyst;
  const settled = allTime.decided > 0;

  const metrics: { label: string; value: string; tone?: 'win' | 'loss' }[] = [
    {
      label: 'საშ. კოეფ.',
      value: settled ? formatOdds(allTime.avgOddsMilli) : '·',
    },
    { label: 'ჩანაწერი', value: `${allTime.won}-${allTime.lost}` },
    {
      label: 'სიზუსტე',
      value: settled ? formatPercentBps(allTime.hitRateBps) : '·',
    },
    {
      label: 'ერთეულები',
      value: settled ? formatUnitsSigned(allTime.profitUnitsCenti) : '·',
      ...(settled
        ? {
            tone:
              allTime.profitUnitsCenti < 0
                ? ('loss' as const)
                : ('win' as const),
          }
        : {}),
    },
  ];

  return (
    <li className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center lg:gap-8">
      {/*
       * min-w-0: without it this grid item takes its automatic minimum size
       * from the nowrap `truncate` children below, which pushes the whole row
       * past the viewport on a phone instead of letting the text ellipsis.
       */}
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <Avatar name={analyst.displayName} size="md" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-lg font-bold text-ink">
                <Link
                  href={`/analysts/${analyst.slug}?tab=plans`}
                  className="hover:underline"
                >
                  {analyst.displayName}
                </Link>
              </h3>
              {analyst.isDemo ? <DemoBadge /> : null}
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              <span className="truncate">
                {analyst.sports.map((sport) => sport.nameKa).join(', ')}
                {' ანალიტიკოსი'}
              </span>

              {/*
               * The one hot colour in the system, and it is a count rather
               * than a judgement: how many of this author's bets are still
               * undecided right now, which is what a subscription actually
               * buys access to.
               */}
              {analyst.activeBets > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                  <span className="tabular inline-flex min-w-5 justify-center rounded bg-signal px-1.5 py-0.5 font-bold text-on-signal">
                    {analyst.activeBets}
                  </span>
                  აქტიური
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {/*
         * Two columns on the narrowest screens so the labels stay readable.
         * Five squeezed into 375px would wrap every Georgian caption onto
         * three lines and stop scanning as a strip at all.
         */}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs leading-snug text-ink-faint">
                {metric.label}
              </dt>
              <dd
                className={`tabular mt-0.5 text-base font-bold ${
                  metric.tone === 'loss'
                    ? 'text-loss'
                    : metric.tone === 'win'
                      ? 'text-win'
                      : 'text-ink'
                }`}
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/*
       * Price. Kept clear of the metric strip on purpose: what an analyst
       * charges is not one of their results and should not read as one.
       */}
      <div className="flex flex-col gap-2 border-t border-line pt-4 lg:border-t-0 lg:pt-0">
        {/*
         * Two actions, in the order a reader actually wants them: look first,
         * pay second. Previously the only control on the row was the price
         * button, so "read this person's record" and "buy this person's
         * analysis" were the same click.
         */}
        <Link
          href={`/analysts/${analyst.slug}?tab=free`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
        >
          გადახედე
        </Link>

        <Link
          href={`/analysts/${analyst.slug}?tab=plans`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-ink px-4 text-sm font-semibold text-on-ink transition-colors hover:bg-accent"
        >
          {cheapestPlan === null
            ? 'პროფილის ნახვა'
            : cheapestPlan.priceMinor === 0
              ? 'უფასო წვდომა'
              : `გამოწერა ${formatMoney(cheapestPlan.priceMinor, cheapestPlan.currency)}-დან`}
        </Link>

        <p className="text-center text-xs leading-relaxed text-ink-faint">
          {cheapestPlan === null || cheapestPlan.priceMinor === 0 ? (
            'გამოწერა გაძლევთ წვდომას ავტორის ფსონებზე.'
          ) : (
            <>
              განახლდება{' '}
              <span className="tabular">
                {formatMoney(cheapestPlan.priceMinor, cheapestPlan.currency)}
              </span>
              -ად {BILLING_PERIOD_KA[cheapestPlan.billingPeriod]} · გაუქმება
              ნებისმიერ დროს
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * The container the rows live in: one panel, hairlines between entries.
 */
export function AnalystList({ analysts }: { analysts: AnalystListItem[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
      {analysts.map((analyst) => (
        <AnalystRow key={analyst.id} analyst={analyst} />
      ))}
    </ul>
  );
}
