'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_STORAGE_KEY } from './theme-script';

type Theme = 'light' | 'dark';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'ღია თემა', Icon: Sun },
  { value: 'dark', label: 'მუქი თემა', Icon: Moon },
];

/*
 * The stored choice is external state, so it is read through
 * useSyncExternalStore rather than copied into React state inside an effect.
 * That avoids the cascading render an effect-plus-setState would cause, and it
 * comes with the cross-tab behaviour for free: `storage` fires in every other
 * tab, so switching the theme in one window updates the control in all of them.
 *
 * The server snapshot is null, which renders the control with nothing selected.
 * localStorage is unreadable during SSR, so any other answer would be a guess
 * that flickers when it turns out wrong.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  try {
    // Anything that is not an explicit "light" is the default: dark.
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light'
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

function getServerSnapshot(): Theme | null {
  return null;
}

/**
 * Light / dark.
 *
 * Two states, with dark as the product's default - the server stamps
 * data-theme="dark" on <html> and the boot script only ever corrects it to
 * light. There is deliberately no "system" state: the product committed to a
 * dark look, and a reader who wants light says so here.
 *
 * Rendered as a segmented control with real radio semantics, so it is operable
 * from the keyboard and announced as one choice rather than as two buttons
 * that happen to sit together.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const choose = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', next);

    // Keep the browser chrome on the same ground as the page. Read from the
    // live token rather than a copied hex, so a palette change cannot leave
    // the chrome behind.
    const canvas = getComputedStyle(root)
      .getPropertyValue('--color-canvas')
      .trim();
    if (canvas) {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', canvas);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse storage. The attribute above still applies
      // for this page view, which is the part the reader actually asked for.
    }

    notify();
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="თემა"
      className="inline-flex items-center gap-0.5 rounded-control border border-line bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`inline-flex size-8 items-center justify-center rounded transition-colors ${
              selected ? 'bg-ink text-on-ink' : 'text-ink-faint hover:text-ink'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
