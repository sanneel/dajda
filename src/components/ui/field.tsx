import type { ComponentProps, ReactNode } from 'react';

/**
 * Form primitives.
 *
 * Every control is wired to a real <label htmlFor>, and errors are linked with
 * aria-describedby + aria-invalid so a screen reader announces the problem
 * with the field rather than somewhere else on the page.
 */

const CONTROL =
  'w-full min-h-11 rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-ink ' +
  'placeholder:text-ink-faint transition-colors duration-150 ' +
  'hover:border-ink-faint focus:border-accent focus:outline-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-loss';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-ink"
      >
        {label}
        {required ? (
          <span className="ml-1 text-loss" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="mt-1.5 text-xs text-loss"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  error,
  className,
  id,
  ...rest
}: ComponentProps<'input'> & { error?: boolean }) {
  return (
    <input
      {...rest}
      id={id}
      aria-invalid={error || undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${CONTROL} ${className ?? ''}`}
    />
  );
}

export function Textarea({
  error,
  className,
  id,
  ...rest
}: ComponentProps<'textarea'> & { error?: boolean }) {
  return (
    <textarea
      {...rest}
      id={id}
      aria-invalid={error || undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${CONTROL} min-h-32 resize-y leading-relaxed ${className ?? ''}`}
    />
  );
}

export function Select({
  error,
  className,
  id,
  children,
  ...rest
}: ComponentProps<'select'> & { error?: boolean }) {
  return (
    <select
      {...rest}
      id={id}
      aria-invalid={error || undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${CONTROL} appearance-none bg-elevated pr-8 ${className ?? ''}`}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  id,
  error,
  ...rest
}: ComponentProps<'input'> & { label: ReactNode; error?: string }) {
  return (
    <div>
      {/* Padding gives the whole row a 44px hit area, not just the 16px box. */}
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-start gap-2.5 py-2 text-sm text-ink-muted"
      >
        <input
          {...rest}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-loss" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
