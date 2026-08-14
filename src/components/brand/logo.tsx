type LogoProps = {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

/**
 * DAJDA mark.
 *
 * A ticket with a torn perforation edge and a settled check - "ბილეთი დაჯდა",
 * a slip that landed. Deliberately no coin, note, currency glyph, dice, chip
 * or card suit: DAJDA sells analysis, and the mark should not imply a casino.
 */
export function DajdaMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Ticket body. The two notches read as a perforated stub. */}
      <path
        d="M3 9.5A2.5 2.5 0 0 1 5.5 7h21A2.5 2.5 0 0 1 29 9.5V13a3 3 0 0 0 0 6v3.5a2.5 2.5 0 0 1-2.5 2.5h-21A3 3 0 0 1 3 22.5V19a3 3 0 0 0 0-6V9.5Z"
        fill="var(--color-elevated)"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
      />
      {/* Perforation between stub and body. */}
      <path
        d="M11.5 9.5v13"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 3"
      />
      {/* The result: a check, in the accent that marks a landed prediction. */}
      <path
        d="m16 16.4 2.6 2.7 5.2-5.6"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * DAJDA wordmark.
 *
 * Set as real text - the brand name stays selectable and readable to assistive
 * technology without a duplicate aria-label. The slant and the tight tracking
 * approximate the comp's display lettering; the accent sits on the middle
 * stroke so the mark carries the brand colour at any size.
 *
 * This is an approximation of a drawn lettermark. If the real logo arrives as
 * a vector, replace the span with the SVG and nothing else has to change.
 */
export function Logo({ size = 28, showWordmark = true, className }: LogoProps) {
  if (!showWordmark) {
    return (
      <span className={className}>
        <DajdaMark size={size} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-baseline text-ink ${className ?? ''}`}
      style={{
        fontSize: size,
        fontWeight: 900,
        fontStretch: '72%',
        letterSpacing: '-0.02em',
        transform: 'skewX(-8deg)',
        lineHeight: 1,
      }}
    >
      DA
      <span className="text-accent">J</span>
      DA
    </span>
  );
}
