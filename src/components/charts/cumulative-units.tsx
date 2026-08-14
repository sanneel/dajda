import type { CumulativePoint } from '@/lib/stats/performance';
import { formatUnitsSigned } from '@/lib/format';

/**
 * Cumulative units over the analyst's published history.
 *
 * Hand-drawn SVG rather than a charting library: the shape is simple, and this
 * keeps the dependency list short and the rendering fully server-side.
 * The viewBox scales to any width, so it stays readable at 375px.
 */

const WIDTH = 640;
const HEIGHT = 180;
const PAD_X = 8;
const PAD_Y = 14;

export function CumulativeUnitsChart({
  points,
  className,
}: {
  points: CumulativePoint[];
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-muted">
        გრაფიკისთვის ჯერ არ არის საკმარისი დათვლილი ფსონი.
      </div>
    );
  }

  const values = points.map((point) => point.cumulativeUnitsCenti);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  // Guard a flat series against division by zero.
  const span = max - min || 100;

  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;

  const x = (index: number) =>
    PAD_X + (index / (points.length - 1)) * innerW;
  const y = (value: number) =>
    PAD_Y + innerH - ((value - min) / span) * innerH;

  const zeroY = y(0);
  const last = values[values.length - 1] ?? 0;
  const positive = last >= 0;
  const stroke = positive ? 'var(--color-win)' : 'var(--color-loss)';

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.cumulativeUnitsCenti).toFixed(1)}`)
    .join(' ');

  // Close the path along the zero baseline so the fill reads as profit area.
  const area = `${line} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const gradientId = 'dajda-cumulative-fill';

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`h-[180px] w-full ${className ?? ''}`}
      role="img"
      aria-label={`კუმულაციური ერთეულები ${points.length} დათვლილ ფსონზე. მიმდინარე შედეგი ${formatUnitsSigned(last)} ერთეული.`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Break-even reference. */}
      <line
        x1={PAD_X}
        y1={zeroY}
        x2={WIDTH - PAD_X}
        y2={zeroY}
        stroke="var(--color-line-strong)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
