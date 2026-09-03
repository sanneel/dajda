import { Check } from 'lucide-react';
import { formatDateTimeKa, formatOdds } from '@/lib/format';
import type { SlipSelection } from '@/lib/predictions/slip';
import type { PredictionStatus } from '@/generated/prisma/enums';
import { StatusBadge } from './ui/badge';

/**
 * The public face of a bet.
 *
 * The bookmaker's screenshot never renders on a public page: it carries the
 * operator's branding, and often the author's balance and account number.
 * What the reader sees is this, built from the legs the author typed. The
 * screenshot stays with the author and the administrator, and once the bet
 * is settled the ticket says so, with the source the administrator named.
 *
 * Deliberately plain. A slip is a receipt, not an odds board: one surface,
 * ruled rows, tabular numbers, and colour only where a verdict already uses
 * it. Bets published before legs existed have a title and a price and
 * nothing else, and render as a single-line ticket rather than an empty one.
 */
export type SlipTicket = {
  titleKa: string;
  oddsMilli: number;
  status: PredictionStatus;
  eventAt: Date | null;
  selections: SlipSelection[];
  sport: { nameKa: string };
  result?: { settlementSource: string; settledAt: Date } | null;
};

export function Slip({
  ticket,
  variant = 'full',
}: {
  ticket: SlipTicket;
  /** `compact` is for cards: the first legs and the price, nothing else. */
  variant?: 'full' | 'compact';
}) {
  const legs: SlipSelection[] =
    ticket.selections.length > 0
      ? ticket.selections
      : [{ eventKa: ticket.titleKa, pickKa: '', oddsMilli: ticket.oddsMilli }];

  if (variant === 'compact') {
    const shown = legs.slice(0, 3);
    const more = legs.length - shown.length;
    return (
      <div className="flex h-full flex-col justify-between bg-canvas p-3 text-sm">
        <ul className="space-y-1">
          {shown.map((leg, index) => (
            <li key={index} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-ink">
                {leg.eventKa}
                {leg.pickKa ? (
                  <span className="text-ink-muted"> · {leg.pickKa}</span>
                ) : null}
              </span>
              <span className="tabular shrink-0 text-ink-muted">
                {formatOdds(leg.oddsMilli)}
              </span>
            </li>
          ))}
          {more > 0 ? (
            <li className="text-xs text-ink-faint">კიდევ {more} პოზიცია</li>
          ) : null}
        </ul>
        <p className="mt-2 flex items-baseline justify-between border-t border-dashed border-line-strong pt-2">
          <span className="text-xs text-ink-faint">ჯამური</span>
          <span className="tabular font-semibold text-ink">
            {formatOdds(ticket.oddsMilli)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">DAJDA</span> ბილეთი ·{' '}
          {ticket.sport.nameKa}
          {ticket.eventAt ? (
            <>
              {' · '}
              <span className="tabular">{formatDateTimeKa(ticket.eventAt)}</span>
            </>
          ) : null}
        </p>
        <StatusBadge status={ticket.status} />
      </div>

      <ol className="divide-y divide-line">
        {legs.map((leg, index) => (
          <li
            key={index}
            className="flex items-start gap-4 px-4 py-3 sm:px-5"
          >
            <span className="tabular w-5 shrink-0 pt-0.5 text-xs text-ink-faint">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{leg.eventKa}</span>
              {leg.pickKa ? (
                <span className="block text-sm text-ink-muted">{leg.pickKa}</span>
              ) : null}
            </span>
            <span className="tabular shrink-0 text-ink">
              {formatOdds(leg.oddsMilli)}
            </span>
          </li>
        ))}
      </ol>

      {/* The perforation: where a paper slip tears. */}
      <div className="mx-4 border-t border-dashed border-line-strong sm:mx-5" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-muted">
          {legs.length === 1 ? 'ერთი პოზიცია' : `${legs.length} პოზიცია`}
        </p>
        <p className="text-sm text-ink-muted">
          ჯამური კოეფიციენტი{' '}
          <span className="tabular text-lg font-semibold text-ink">
            {formatOdds(ticket.oddsMilli)}
          </span>
        </p>
      </div>

      {ticket.result ? (
        <p className="flex items-start gap-2 border-t border-line bg-canvas px-4 py-3 text-sm text-ink-muted sm:px-5">
          <Check className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <span>
            შემოწმებულია ორიგინალ ბილეთთან ადმინისტრატორის მიერ,{' '}
            <span className="tabular">{formatDateTimeKa(ticket.result.settledAt)}</span>
            {' · წყარო: '}
            <span className="text-ink">{ticket.result.settlementSource}</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}
