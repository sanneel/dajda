import type { ReactNode } from 'react';
import type { PredictionStatus } from '@/generated/prisma/enums';
import { PREDICTION_STATUS_KA } from '@/lib/labels';

type Tone = 'neutral' | 'accent' | 'win' | 'loss' | 'pending' | 'warn';

/*
 * Colour in this system means one thing: how a bet resolved. `warn` therefore
 * carries no hue - a dashed outline says "provisional" (demo data, a record
 * too short to rank) without competing with a result for attention.
 *
 * `win` is green, not the brand accent. On the dark palette the two were one
 * colour because the comp merged them; on this one they are separate, and a
 * won bet painted in the brand colour is what a bookmaker's interface does.
 */
const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-elevated text-ink-muted',
  accent: 'border-accent/30 bg-accent/8 text-accent',
  win: 'border-win/30 bg-win/8 text-win',
  loss: 'border-loss/30 bg-loss/8 text-loss',
  pending: 'border-line-strong bg-elevated text-ink-muted',
  warn: 'border-dashed border-line-strong bg-transparent text-ink-faint',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<PredictionStatus, Tone> = {
  WON: 'win',
  LOST: 'loss',
  PENDING: 'pending',
  VOID: 'neutral',
  PUSH: 'neutral',
};

/**
 * Result chip. Colour alone never carries the meaning - the Georgian label is
 * always present, so the status survives greyscale and colour blindness.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: PredictionStatus;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <span
        aria-hidden="true"
        className={[
          'size-1.5 rounded-full',
          status === 'WON'
            ? 'bg-win'
            : status === 'LOST'
              ? 'bg-loss'
              : 'bg-ink-faint',
        ].join(' ')}
      />
      {PREDICTION_STATUS_KA[status]}
    </Badge>
  );
}

/** Marks seeded demonstration content so it is never mistaken for a real record. */
export function DemoBadge() {
  return (
    <Badge tone="warn" className="uppercase tracking-wide">
      დემო
    </Badge>
  );
}
