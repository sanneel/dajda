import type { ReactNode } from 'react';

/**
 * Copy still waiting to be written is passed in square brackets - see the
 * `.ph` rule in globals.css. Detecting it here keeps every call site from
 * having to pass a flag alongside the text.
 */
function isPlaceholder(text: ReactNode): boolean {
  return typeof text === 'string' && text.trimStart().startsWith('[');
}

/**
 * Sharp, thin-bordered surface. Elevation is expressed with a border and a
 * small background step rather than a drop shadow, which keeps dense grids
 * from turning muddy.
 */
export function Card({
  children,
  className,
  as: Tag = 'div',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
  interactive?: boolean;
}) {
  return (
    <Tag
      className={[
        'rounded-card border border-line bg-surface',
        interactive
          ? 'transition-colors duration-150 hover:border-line-strong hover:bg-elevated'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-4 sm:p-5 ${className ?? ''}`}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Kept explicit so each page maintains a correct heading order. */
  level?: 2 | 3 | 4;
}) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <Heading className="font-display text-base text-ink">
          {title}
        </Heading>
        {description ? (
          <p
            className={`mt-1 text-sm ${
              isPlaceholder(description) ? 'ph' : 'text-ink-muted'
            }`}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
