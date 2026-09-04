'use client';

import { useState } from 'react';
import type {
  MonthlyBucket,
  OddsBucket,
  PerformanceSummary,
} from '@/lib/stats/performance';
import { formatGelSigned, formatPercentBps } from '@/lib/format';
import { Card, CardBody } from '@/components/ui/card';
import { Stat, RecordBar } from '@/components/ui/stat';
import type { PlanView } from '@/components/plan-card';
import { OddsBucketsChart } from '@/components/charts/odds-buckets';
import { MonthlyBars } from '@/components/charts/monthly-bars';

type Tab = 'FREE' | 'PAID' | 'PLANS';

export type PanelPlan = PlanView & {
  /** Set when the viewer already holds this plan. */
  currentStatus?: 'ACTIVE' | 'PENDING';
};

/** The charts for one slice of the record, computed server-side. */
export type TabCharts = {
  monthly: MonthlyBucket[];
  oddsBuckets: OddsBucket[];
};

/**
 * The analyst's record: one panel, one view at a time, switched in the corner.
 *
 * This replaced two stacked cards - an overall summary and a free/paid split -
 * which asked the reader to hold six numbers in their head while scrolling
 * past six more that partly restated them. A profile answers one question at a
 * time, and the switch is which question: what the free tickets returned, what
 * the paid ones returned, or what the paid ones cost.
 *
 * Subscription is a position in the same switch rather than a section further
 * down, because it is the answer to a question the other two positions
 * provoke. It is absent entirely when nothing here is for sale.
 */
export function RecordTabs({
  free,
  paid,
  freeCharts,
  paidCharts,
  plans,
  initialTab = 'FREE',
}: {
  free: PerformanceSummary;
  paid: PerformanceSummary;
  freeCharts: TabCharts;
  paidCharts: TabCharts;
  plans: PanelPlan[];
  /** Chosen by the page from ?tab=, so a deep link opens the right panel. */
  initialTab?: Tab;
}) {
  /*
   * "Sells subscriptions" means a plan that costs money. An analyst whose only
   * plans are free gets no subscription position - offering to sell something
   * with nothing behind it is worse than staying quiet.
   */
  const sellable = plans.filter((plan) => plan.priceMinor > 0);
  const hasSubscription = sellable.length > 0;

  // Never open on a panel that is not there to open.
  const [tab, setTab] = useState<Tab>(
    initialTab === 'PLANS' && !hasSubscription ? 'FREE' : initialTab,
  );

  return (
    <Card as="section">
      {/*
       * The switch leads and the title follows. The switch is the control
       * the reader actually uses, and in an RTL-of-attention layout like a
       * stats panel the left edge is where the hand goes first; the title
       * only names what the switch already selected.
       */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div
          className="flex items-center gap-1"
          role="tablist"
          aria-label="ჩანაწერის კატეგორია"
        >
          <TabButton selected={tab === 'FREE'} onSelect={() => setTab('FREE')}>
            უფასო
          </TabButton>
          <TabButton selected={tab === 'PAID'} onSelect={() => setTab('PAID')}>
            ფასიანი
          </TabButton>
          {hasSubscription ? (
            <TabButton
              selected={tab === 'PLANS'}
              onSelect={() => setTab('PLANS')}
            >
              გამოწერა
            </TabButton>
          ) : null}
        </div>

        <h2 id="plans-heading" className="font-display text-base text-ink">
          {tab === 'PLANS' ? 'გამოწერა' : 'პროგნოზების ჩანაწერი'}
        </h2>
      </div>

      <CardBody>
        {/*
         * Statistics only, on every tab. The subscription itself is bought
         * from the button in the profile header, not from inside the
         * record: this panel answers "how did the bets go", and the price
         * is a different question.
         */}
        <div>
          <RecordStats summary={tab === 'FREE' ? free : paid} />
          {/*
           * The charts belong to the slice the switch selected: the free
           * tab charts the free record, the paid tab the paid one, so a
           * number and its picture can never disagree.
           */}
          <ChartPair
            tab={tab}
            charts={tab === 'FREE' ? freeCharts : paidCharts}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function TabButton({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`min-h-9 rounded-control px-3 py-1.5 text-sm transition-colors ${
        selected
          ? 'bg-ink font-semibold text-on-ink'
          : 'text-ink-muted hover:bg-elevated hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One slice of the record.
 *
 * Profit and hit rate are shown together on purpose - any one alone can
 * flatter (a high hit rate at 1.10, a big profit on three bets) - and the
 * RecordBar keeps the sample size attached to every rate derived from it.
 */
function RecordStats({ summary }: { summary: PerformanceSummary }) {
  const settled = summary.decided > 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="სულ პროგნოზი"
          value={summary.total}
          hint={`${summary.pending} მოლოდინში`}
          size="lg"
        />
        <Stat label="მოგებული" value={summary.won} tone="positive" size="lg" />
        <Stat label="წაგებული" value={summary.lost} tone="negative" size="lg" />
        <Stat
          label="მოგებების პროცენტი"
          value={settled ? formatPercentBps(summary.hitRateBps) : '·'}
          hint={settled ? `${summary.decided} დათვლილი` : undefined}
          size="lg"
        />
        <Stat
          label="მოგება"
          value={settled ? formatGelSigned(summary.profitUnitsCenti) : '·'}
          tone={
            summary.profitUnitsCenti > 0
              ? 'positive'
              : summary.profitUnitsCenti < 0
                ? 'negative'
                : 'default'
          }
          hint={settled ? '100 ₾ / ბილეთზე' : undefined}
          size="lg"
        />
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <RecordBar
          won={summary.won}
          lost={summary.lost}
          pending={summary.pending}
        />
      </div>
    </div>
  );
}

/**
 * The two pictures of one slice: month by month on the left, per odds range
 * on the right, side by side from lg up and stacked on a phone. Keyed on
 * the tab so switching resets each chart's selection.
 */
function ChartPair({ tab, charts }: { tab: Tab; charts: TabCharts }) {
  return (
    <div className="mt-6 grid gap-8 border-t border-line pt-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">მოგება თვეების მიხედვით</h3>
        <MonthlyBars key={`m-${tab}`} buckets={charts.monthly} />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">
          შედეგი კოეფიციენტების მიხედვით
        </h3>
        <OddsBucketsChart key={`o-${tab}`} buckets={charts.oddsBuckets} />
      </div>
    </div>
  );
}
