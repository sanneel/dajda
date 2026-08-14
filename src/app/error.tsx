'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button, ButtonLink } from '@/components/ui/button';

/**
 * Root error boundary.
 *
 * Shows the framework-provided digest but never the message or stack - those
 * can carry query fragments and internal paths.
 */

/**
 * In development, name the one failure that looks identical to a code bug from
 * the browser: the database not being reachable. Next redacts server error
 * messages in production, so this can only ever fire locally - and it is gated
 * on NODE_ENV as well, so the diagnostic is stripped from the production
 * bundle rather than merely going unused.
 */
function devDatabaseHint(error: Error): string | null {
  if (process.env.NODE_ENV !== 'development') return null;

  const text = `${error.message}`;
  const looksLikeConnectionFailure =
    /ECONNREFUSED|Server has closed the connection|Can't reach database server|connection.*(closed|refused|terminated)/i.test(
      text,
    );

  return looksLikeConnectionFailure
    ? 'The development database is not reachable. Start the full stack with `npm run dev` (it launches the database too), or run `npm run dev:db` on its own. If port 5432 is held by a wedged process, kill it and retry.'
    : null;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dajda] render error', error);
  }, [error]);

  const hint = devDatabaseHint(error);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center"
    >
      <Logo size={28} />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight text-ink">
        დაფიქსირდა შეცდომა
      </h1>
      <p className="mt-2 text-ink-muted">
        გვერდი ვერ ჩაიტვირთა. სცადეთ ხელახლა. თუ პრობლემა გრძელდება, მოგვწერეთ.
      </p>

      {error.digest ? (
        <p className="tabular mt-3 text-xs text-ink-faint">
          კოდი: {error.digest}
        </p>
      ) : null}

      {hint ? (
        <p className="mt-6 rounded-card border border-dashed border-line-strong bg-elevated px-4 py-3 text-left text-sm leading-relaxed text-ink">
          <span className="rule-label mb-1 block">dev only</span>
          {hint}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          ხელახლა ცდა
        </Button>
        <ButtonLink href="/" variant="secondary">
          მთავარი გვერდი
        </ButtonLink>
      </div>
    </main>
  );
}
