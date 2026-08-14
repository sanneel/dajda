import { initialsOf } from '@/lib/format';

/**
 * Generated initials avatar. Profile pictures are still never uploaded: bet
 * screenshots are now the product's ONLY upload surface (see lib/uploads.ts),
 * and keeping identity out of it means one fewer path to harden.
 *
 * One treatment for everybody. Hashing a name into one of several pastel hues
 * makes the roster look like a colour lottery and spends colour - which this
 * palette reserves for results - on identity, where the initials already do
 * the distinguishing.
 */

const SIZES = {
  sm: 'size-9 text-sm',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
};

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      className={`tabular inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-elevated font-medium text-ink-muted ${SIZES[size]}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
