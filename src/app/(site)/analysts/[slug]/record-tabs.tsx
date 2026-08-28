'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PerformanceSummary } from '@/lib/stats/performance';
import {
  formatPercentBps,
  formatUnitsSigned,
} from '@/lib/format';
import { Card, CardBody } from '@/components/ui/card';
import { Stat, RecordBar } from '@/components/ui/stat';
import { PlanCard, type PlanView } from '@/components/plan-card';

type Tab = 'FREE' | 'PAID' | 'PLANS';

export type PanelPlan = PlanView & {
  /** Set when the viewer already holds this plan. */
  currentStatus?: 'ACTIVE' | 'PENDING';
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
  plans,
  isAuthenticated,
  initialTab = 'FREE',
}: {
  free: PerformanceSummary;
  paid: PerformanceSummary;
  plans: PanelPlan[];
  isAuthenticated: boolean;
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="plans-heading" className="font-display text-base text-ink">
          {tab === 'PLANS' ? 'გამოწერა' : 'პროგნოზების ჩანაწერი'}
        </h2>

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
      </div>

      <CardBody>
        {tab === 'PLANS' ? (
          <Plans plans={sellable} isAuthenticated={isAuthenticated} />
        ) : (
          <RecordStats summary={tab === 'FREE' ? free : paid} />
        )}
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
          label="პროფიტი"
          value={settled ? formatUnitsSigned(summary.profitUnitsCenti) : '·'}
          tone={
            summary.profitUnitsCenti > 0
              ? 'positive'
              : summary.profitUnitsCenti < 0
                ? 'negative'
                : 'default'
          }
          hint={settled ? 'ერთეული' : undefined}
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

function Plans({
  plans,
  isAuthenticated,
}: {
  plans: PanelPlan[];
  isAuthenticated: boolean;
}) {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            featured={plan.tier === 'PREMIUM'}
            isAuthenticated={isAuthenticated}
            currentStatus={plan.currentStatus}
          />
        ))}
      </div>

      {/*
       * Billing terms sit at the point of purchase - there is no platform-wide
       * subscriptions page any more. The two links are real because they are
       * navigation, not copy; the sentences are not.
       */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="ph text-xs leading-relaxed">
          [3 პუნქტი გადახდამდე: (1) როდის აქტიურდება გეგმა, (2) ავტომატური
          განახლება და გაუქმება, (3) ბარათის მონაცემები]
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          <Link
            href="/dashboard"
            className="text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent"
          >
            პროფილი → გამოწერები
          </Link>
          {' · '}
          <Link
            href="/legal#refunds"
            className="text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent"
          >
            დაბრუნების პოლიტიკა
          </Link>
        </p>
      </div>
    </div>
  );
}
