import {
  CircleDot,
  Flame,
  Gamepad2,
  Goal,
  Hand,
  Snowflake,
  Swords,
  Target,
  Trophy,
  Volleyball,
} from 'lucide-react';

/**
 * The thumbnail a bet shows before its slip is readable.
 *
 * A padlock was the wrong picture: every unopened row looked like a paywall,
 * including the free ones, which are only a click and an account away. This
 * shows the sport instead - the one fact about the bet that is never withheld
 * - so a list of unopened rows reads as a set of matches rather than a set of
 * locked doors.
 *
 * It is deliberately NOT the real screenshot. That image is the slip, and the
 * slip is the pick: blurring it in CSS would still ship the file, and anyone
 * could open it directly. A glyph leaks nothing.
 */

const GLYPHS: Record<string, React.ComponentType<{ className?: string }>> = {
  FOOTBALL: Goal,
  BASKETBALL: CircleDot,
  TENNIS: CircleDot,
  RUGBY: Trophy,
  VOLLEYBALL: Volleyball,
  HANDBALL: Hand,
  ICE_HOCKEY: Snowflake,
  MMA: Swords,
  BOXING: Flame,
  ESPORTS: Gamepad2,
};

export function SportTile({
  code,
  className = '',
  iconClassName = 'size-6',
}: {
  /** Sport code from the database; unknown codes fall back to a target. */
  code: string;
  /** Sizing and radius come from the caller - list and table differ. */
  className?: string;
  iconClassName?: string;
}) {
  const Glyph = GLYPHS[code] ?? Target;

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-line bg-elevated ${className}`}
      aria-hidden="true"
    >
      {/* A single soft wash off the accent, so the tile has depth without
          becoming a second coloured element competing with the status badges. */}
      <span className="absolute inset-0 bg-gradient-to-br from-accent/12 to-transparent" />
      <Glyph className={`relative text-ink-faint ${iconClassName}`} />
    </span>
  );
}
