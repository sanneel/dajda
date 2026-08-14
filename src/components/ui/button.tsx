import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/** Every size clears the 44px minimum touch target. */
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3.5 text-sm gap-1.5',
  md: 'min-h-11 px-5 text-[0.9375rem] gap-2',
  lg: 'min-h-[3.25rem] px-7 text-base gap-2.5',
};

/*
 * The primary fill is `ink`, not `accent`.
 *
 * On the light ground the darkest navy is what reads as the committed action,
 * exactly as in the reference comps, and it leaves `accent` free to mean "a
 * link or the current thing" without every link looking like a button.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink font-semibold hover:bg-accent active:bg-accent',
  secondary:
    'bg-surface text-ink border border-line-strong hover:border-ink-faint hover:bg-elevated',
  ghost: 'text-ink-muted hover:text-ink hover:bg-elevated',
  danger:
    'bg-surface text-loss border border-loss/35 hover:border-loss hover:bg-loss/5',
};

const BASE =
  'inline-flex items-center justify-center rounded-control transition-colors duration-150 ' +
  'disabled:opacity-45 disabled:pointer-events-none select-none whitespace-nowrap';

export function buttonClass(
  variant: Variant = 'primary',
  size: Size = 'md',
  extra?: string,
): string {
  return [BASE, SIZES[size], VARIANTS[variant], extra].filter(Boolean).join(' ');
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
