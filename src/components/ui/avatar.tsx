import Image from 'next/image';
import { initialsOf } from '@/lib/format';

/**
 * A person, as a circle.
 *
 * An author's photograph when there is one, their initials when there is not.
 * Every new analyst application requires a photograph (see the apply form), so
 * the initials are the fallback for the profiles approved before that rule and
 * for readers, who never upload one.
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

/** Rendered pixel width per size, for the image request. */
const PIXELS: Record<keyof typeof SIZES, number> = {
  sm: 36,
  md: 48,
  lg: 64,
};

export function Avatar({
  name,
  size = 'md',
  src = null,
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** The author's photograph, when the profile carries one. */
  src?: string | null;
}) {
  const shell =
    `relative inline-flex shrink-0 items-center justify-center overflow-hidden ` +
    `rounded-full border border-line-strong bg-elevated ${SIZES[size]}`;

  if (src) {
    return (
      <span className={shell}>
        <Image
          src={src}
          alt=""
          width={PIXELS[size]}
          height={PIXELS[size]}
          className="size-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`tabular font-medium text-ink-muted ${shell}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
