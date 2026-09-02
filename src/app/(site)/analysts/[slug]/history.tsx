'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDateTimeKa, formatMoney, formatOdds } from '@/lib/format';
import { StatusBadge } from '@/components/ui/badge';
import { ShowMoreList } from '@/components/ui/show-more';

/**
 * Everything this author has posted, split by how it was sold.
 *
 * The profile carried aggregates and three pinned tickets and then stopped,
 * so "what has this person actually put out" had no answer on the page they
 * are judged from. The split is by access type because that is the question a
 * reader arrives with: free tickets are the sample, singly-priced ones are the
 * shop, and subscription-only ones are what a subscription is for.
 *
 * Rendered from rows the server already fetched for the stats above, so this
 * costs no extra query.
 */

export type HistoryEntry = {
  id: string;
  /**
   * Null when the pick is withheld from this viewer. The server decides and
   * strips it before the entry is serialised - this component never holds a
   * title it is not allowed to print, so there is nothing here to leak.
   */
  titleKa: string | null;
  oddsMilli: number;
  visibility: 'PUBLIC' | 'PREMIUM' | 'VIP';
  priceMinor: number | null;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PUSH';
  publishedAt: string | null;
  sportNameKa: string;
};

const TABS = [
  { id: 'PUBLIC', label: 'უფასო' },
  { id: 'PREMIUM', label: 'ფასიანი' },
  { id: 'VIP', label: 'გამოწერა' },
] as const;

export function AnalystHistory({ entries }: { entries: HistoryEntry[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('PUBLIC');
  const shown = entries.filter((entry) => entry.visibility === tab);

  return (
    <div>
      <div
        role="tablist"
        aria-label="ბილეთების ისტორია"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((entry) => {
          const count = entries.filter(
            (row) => row.visibility === entry.id,
          ).length;
          const selected = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(entry.id)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm transition-colors ${
                selected
                  ? 'border-accent font-semibold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {entry.label}
              {count > 0 ? (
                <span
                  className={`tabular rounded-full px-1.5 text-xs ${
                    selected
                      ? 'bg-accent/15 text-accent'
                      : 'bg-elevated text-ink-faint'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">
          ამ ტიპის ბილეთი ჯერ არ არის.
        </p>
      ) : (
        <ShowMoreList className="divide-y divide-line" initial={6}>
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5"
            >
              <Link
                href={`/free/${entry.id}`}
                className="min-w-0 flex-1 font-medium text-ink hover:text-accent"
              >
                {entry.titleKa ?? 'დახურული პროგნოზი'}
              </Link>

              {entry.visibility === 'PREMIUM' && entry.priceMinor !== null ? (
                <span className="tabular text-sm text-ink-muted">
                  {formatMoney(entry.priceMinor, 'GEL')}
                </span>
              ) : null}

              <StatusBadge status={entry.status} />

              <p className="tabular w-full text-xs text-ink-faint">
                {entry.sportNameKa}
                {' · კოეფ. '}
                {formatOdds(entry.oddsMilli)}
                {entry.publishedAt
                  ? ` · ${formatDateTimeKa(new Date(entry.publishedAt))}`
                  : ''}
              </p>
            </li>
          ))}
        </ShowMoreList>
      )}
    </div>
  );
}
